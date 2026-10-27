import type { BrowserContext } from "@playwright/test";
import type { ChatAnswer, FollowUp, ScopeKey } from "../../src/lib/assistant";
import { sql } from "./database";
import {
  CAPABILITY_LINE,
  PLAN_NAME,
  UNKNOWN_LEAD,
  ask,
  buildAnswer,
  chatUserId,
  clearPlan,
  createChatUser,
  deleteChatUser,
  expect,
  seedCart,
  seedPlan,
  seedRecipes,
  softDeleteRecipe,
  test
} from "./assistant-helpers";

// API tests of POST /api/rag/chat against a seeded, isolated user (plan D2). Spec assistant-chat-polish: REQ-1, REQ-3,
// REQ-6, REQ-10 (server), REQ-18, REQ-19, REQ-20, and the REQ-5 invariant on follow-ups. The winning topic is identified
// by `kind` + `follow_ups`, since each topic's follow-up list is distinct (plan D1).

// Topics table: follow-ups per topic, in order.
const FOLLOW_UPS = {
  mealTimes: [
    { text: "¿Qué recetas hay en mi plan?", scope: "Recetario" },
    { text: "¿Qué hay en mi carrito?", scope: "Carrito" },
    { text: "¿Cuál es mi objetivo?", scope: "Plan activo" }
  ],
  cart: [
    { text: "¿Qué recetas hay en mi plan?", scope: "Recetario" },
    { text: "¿A qué hora es mi comida?", scope: "Plan activo" }
  ],
  recipeList: [
    { text: "¿Qué hay en mi carrito?", scope: "Carrito" },
    { text: "¿A qué hora es mi comida?", scope: "Plan activo" }
  ],
  thisRecipe: [
    { text: "¿Qué ingredientes lleva?", scope: "Receta" },
    { text: "¿Cómo se prepara?", scope: "Receta" },
    { text: "¿Qué hay en mi carrito?", scope: "Carrito" }
  ],
  plan: [
    { text: "¿A qué hora es mi comida?", scope: "Plan activo" },
    { text: "¿Qué suplementos tomo?", scope: "Plan activo" },
    { text: "¿Qué recetas hay en mi plan?", scope: "Recetario" }
  ]
} satisfies Record<string, FollowUp[]>;

type Topic = keyof typeof FOLLOW_UPS;

const OBJECTIVE = "Mejorar mi energía";
const MEALS = ["Desayuno", "Colación", "Comida", "Cena"];
const PROTEIN = "Proteínas";
const PREPARATION = "Sazonar el pollo.\nAsar 20 minutos.";

let ids: Record<string, string> = {};

/** The default world: three recipes, a plan with every meal time, and a 3-item cart. Tests that need another state reseed. */
function seedDefault() {
  ids = seedRecipes([
    { name: "Quesadillas", ingredients: [{ name: "Tortilla", quantity: 2, unit: "pza" }, { name: "Queso", quantity: 80 }] },
    { name: "Ensalada", ingredients: [{ name: "Lechuga", quantity: 100 }, { name: "Jitomate", quantity: 150 }] },
    {
      name: "Pollo asado",
      description: PREPARATION,
      ingredients: [
        { name: "Pechuga de pollo", quantity: 200, category: PROTEIN },
        { name: "Limón", quantity: 1, unit: "pza" },
        { name: "Aceite de oliva", quantity: 10, unit: "ml" }
      ]
    }
  ]);
  seedPlan({ times: "all" });
  seedCart(3);
}

test.beforeAll(() => createChatUser("api"));
test.afterAll(() => deleteChatUser());
test.beforeEach(() => seedDefault());

const plainOf = (rich: { text: string }[]) => rich.map((span) => span.text).join("");

/** The text of the first section called `title`, one string per item. */
function items(body: ChatAnswer, title: string) {
  const section = body.sections.find((entry) => entry.title === title);
  expect(section, `section "${title}"`).toBeDefined();
  return section!.items.map(plainOf);
}

/** Every field the unknown, out-of-scope and missing-recipe replies share: fixed copy, no data, no sources. */
function expectFixedReply(body: ChatAnswer, kind: "unknown" | "out_of_scope" | "missing_recipe") {
  expect(body.kind).toBe(kind);
  expect(plainOf(body.lead)).toBe(UNKNOWN_LEAD);
  expect(body.body).toBe(CAPABILITY_LINE);
  expect(body.sections).toEqual([]);
  expect(body.follow_ups).toEqual([]);
  expect(body.sources).toEqual([]);
  expect(body.answer).toBe(`${UNKNOWN_LEAD}\n${CAPABILITY_LINE}`);
}

function expectTopic(body: ChatAnswer, topic: Topic, kind: "answer" | "overview" = "answer") {
  expect(body.kind).toBe(kind);
  expect(body.follow_ups).toEqual(FOLLOW_UPS[topic]);
}

test.describe("matcher and routing", () => {
  // REQ-19: the winner is chosen from the words of the question against the Topics vocabulary, regardless of scope.
  const winners: { question: string; topic: Topic; note?: string }[] = [
    { question: "¿Qué ingredientes lleva el desayuno?", topic: "recipeList", note: "tier 2 beats tier 3" },
    { question: "¿A qué hora es la cena?", topic: "mealTimes" },
    { question: "desayuno", topic: "mealTimes", note: "alone" },
    { question: "¿A qué hora compro el súper?", topic: "mealTimes", note: "tier 1 beats tier 2" },
    { question: "¿Cuándo compro?", topic: "cart", note: "cuándo is ignored next to another topic word" },
    { question: "¿Cuándo es la cena?", topic: "mealTimes", note: "cuándo with a meal noun" },
    { question: "¿Cuándo?", topic: "mealTimes", note: "cuándo alone" },
    { question: "¿Cuándo compro la comida?", topic: "mealTimes", note: "cuándo with a meal noun counts even next to a cart word" },
    { question: "¿Qué ingredientes necesito comprar?", topic: "cart", note: "tie: cart before recipes" },
    { question: "¿Qué hay en el carrito, por favor?", topic: "cart" },
    { question: "¿Qué recetas hay en mi plan?", topic: "recipeList", note: "tie: recipes before plan" },
    { question: "plan de compras", topic: "cart", note: "tie: cart before plan" },
    { question: "¿Qué plan tengo para el desayuno?", topic: "plan", note: "tier 2 beats tier 3" },
    { question: "¿Cuál es mi objetivo?", topic: "plan" },
    { question: "¿Qué suplementos tomo?", topic: "plan", note: "stem suplement*" },
    { question: "Dame las recomendaciones", topic: "plan", note: "stem recomend*" },
    { question: "Mis planes", topic: "plan", note: "plural" },
    { question: "¿CUÁL ES MI HORARIO?", topic: "mealTimes", note: "case and accents" },
    { question: "¿Qué horarios tengo?", topic: "mealTimes", note: "plural" },
    { question: "mi colacion", topic: "mealTimes", note: "no accent" },
    { question: "¿Qué colaciones tengo?", topic: "mealTimes", note: "plural" },
    { question: "¿Cómo preparo el pollo?", topic: "recipeList", note: "stem prepar*" },
    { question: "¿Qué ingrediente me falta?", topic: "recipeList", note: "stem ingrediente*, singular" },
    { question: "¿Cuándo compro mis carritos?", topic: "cart", note: "cuándo ignored; plural" }
  ];
  for (const { question, topic, note } of winners) {
    test(`REQ-19 "${question}" in Todo is ${topic}${note ? ` (${note})` : ""}`, async ({ chatContext }) => {
      const { status, body } = await ask(chatContext.request, question);
      expect(status).toBe(200);
      expectTopic(body, topic);
    });
  }

  for (const question of ["¿Qué hago ahora?", "¿Cuál es la capital de Francia?", "hola", "¿Qué cosas tengo?", "ahorita"]) {
    test(`REQ-19 "${question}" matches no topic: the unknown reply in Todo`, async ({ chatContext }) => {
      const { status, body } = await ask(chatContext.request, question);
      expect(status).toBe(200);
      expectFixedReply(body, "unknown");
    });
  }

  test("REQ-19 a word only counts whole: 'ahora' is not 'hora', 'planta' is not 'plan', 'carritito' is not 'carrito'", async ({ chatContext }) => {
    for (const question of ["ahora", "una planta", "carritito"]) {
      const { body } = await ask(chatContext.request, question);
      expect(body.kind, question).toBe("unknown");
    }
  });

  test("REQ-19 the winner is chosen before the scope check: the desayuno recipe question in Carrito is out of scope", async ({ chatContext }) => {
    const { body } = await ask(chatContext.request, "¿Qué ingredientes lleva el desayuno?", "Carrito");
    expectFixedReply(body, "out_of_scope");
  });

  // REQ-20: strict scopes. Rows are the winning topic's question, columns the scope; "Answers in" of the Topics table.
  const questions: Record<string, string> = {
    mealTimes: "¿A qué hora es la cena?",
    cart: "¿Qué hay en mi carrito?",
    recipes: "¿Qué ingredientes lleva?",
    plan: "¿Cuál es mi objetivo?"
  };
  const answeredIn: Record<string, ScopeKey[]> = {
    mealTimes: ["auto", "Plan activo"],
    cart: ["auto", "Carrito"],
    recipes: ["auto", "Recetario", "Receta"],
    plan: ["auto", "Plan activo"]
  };
  const allScopes: ScopeKey[] = ["auto", "Plan activo", "Recetario", "Carrito", "Receta"];
  const topicFor = (topicName: string, scope: ScopeKey): Topic =>
    topicName === "recipes" ? (scope === "Receta" ? "thisRecipe" : "recipeList") : (topicName as Topic);

  for (const topicName of Object.keys(questions)) {
    for (const scope of allScopes) {
      const answered = answeredIn[topicName].includes(scope);
      test(`REQ-20 ${topicName} question in ${scope}: ${answered ? "answered" : "out of scope"}`, async ({ chatContext }) => {
        const { status, body } = await ask(chatContext.request, questions[topicName], scope, scope === "Receta" ? ids["Pollo asado"] : undefined);
        expect(status).toBe(200);
        if (answered) expectTopic(body, topicFor(topicName, scope));
        else expectFixedReply(body, "out_of_scope");
      });
    }
  }

  // No winner: Todo is the unknown reply (REQ-6); a narrowed scope is its overview, with that overview topic's follow-ups.
  const overviews: [ScopeKey, Topic][] = [
    ["Plan activo", "plan"],
    ["Recetario", "recipeList"],
    ["Carrito", "cart"],
    ["Receta", "thisRecipe"]
  ];
  for (const [scope, topic] of overviews) {
    test(`REQ-20 "hola" in ${scope} is its overview`, async ({ chatContext }) => {
      const { status, body } = await ask(chatContext.request, "hola", scope, scope === "Receta" ? ids["Pollo asado"] : undefined);
      expect(status).toBe(200);
      expectTopic(body, topic, "overview");
      expect(body.lead.length).toBeGreaterThan(0);
    });
  }

  test("REQ-20 a deleted recipe in Esta receta is the missing-recipe reply, which wins over the out-of-scope check", async ({ chatContext }) => {
    const recipeId = ids["Pollo asado"];
    softDeleteRecipe(recipeId);
    for (const question of ["¿Qué ingredientes lleva?", "¿Qué hay en mi carrito?", "hola"]) {
      const { status, body } = await ask(chatContext.request, question, "Receta", recipeId);
      expect(status, question).toBe(200);
      expectFixedReply(body, "missing_recipe");
    }
  });

  test("REQ-20 an unknown, absent or foreign recipe id is the missing-recipe reply", async ({ chatContext }) => {
    const foreign = sql(`select id from recipes where user_id <> '${chatUserId()}' and deleted_at is null limit 1`);
    expect(foreign, "the cloned database has a recipe of another user").not.toBe("");
    for (const recipeId of ["no-existe", foreign, undefined]) {
      const { body } = await ask(chatContext.request, "¿Qué ingredientes lleva?", "Receta", recipeId);
      expectFixedReply(body, "missing_recipe");
    }
  });

  test("REQ-20 the old fallback texts no longer exist", async ({ chatContext }) => {
    clearPlan();
    seedCart(0);
    seedRecipes([]);
    const cases: [string, ScopeKey?][] = [
      ["hola", "Plan activo"],
      ["¿Cuál es mi objetivo?", "Plan activo"],
      ["¿Qué hay en mi carrito?", "Recetario"],
      ["¿Qué recetas hay en mi plan?"],
      ["xyz"]
    ];
    for (const [question, scope] of cases) {
      const { body } = await ask(chatContext.request, question, scope);
      const text = JSON.stringify(body);
      expect(text, question).not.toContain("No encontré esa información en tu plan activo.");
      expect(text, question).not.toContain("No encontré esa información en el sistema.");
    }
  });

  test("REQ-6 Todo with an active plan and an unrecognized question has no objective or meals", async ({ chatContext }) => {
    const { status, body } = await ask(chatContext.request, "¿Cuál es la capital de Francia?");
    expect(status).toBe(200);
    expectFixedReply(body, "unknown");
    const text = JSON.stringify(body);
    expect(text).not.toContain(OBJECTIVE);
    for (const meal of MEALS) expect(text).not.toContain(meal);
    expect(text).not.toContain("No pude responder");
  });

  test("REQ-6 Todo with a plan-topic question returns the plan summary", async ({ chatContext }) => {
    const { body } = await ask(chatContext.request, "¿Cuál es mi objetivo?");
    expectTopic(body, "plan");
    expect(body.answer).toContain(OBJECTIVE);
  });

  test("REQ-6 the Plan activo overview still returns the plan summary", async ({ chatContext }) => {
    const { body } = await ask(chatContext.request, "hola", "Plan activo");
    expect(body.answer).toContain(OBJECTIVE);
  });

  test("context_used keeps its meaning: 'Todo el sistema' for auto, otherwise the scope as sent", async ({ chatContext }) => {
    expect((await ask(chatContext.request, "hola")).body.context_used).toBe("Todo el sistema");
    expect((await ask(chatContext.request, "hola", "auto")).body.context_used).toBe("Todo el sistema");
    expect((await ask(chatContext.request, "hola", "Recetario")).body.context_used).toBe("Recetario");
    expect((await ask(chatContext.request, "hola", "Carrito actual")).body.context_used).toBe("Carrito actual");
  });

  test("the scope 'Carrito actual' is an alias of 'Carrito' and any other string is Todo", async ({ chatContext }) => {
    const alias = await ask(chatContext.request, "¿Qué hay en mi carrito?", "Carrito actual");
    expectTopic(alias.body, "cart");
    const overview = await ask(chatContext.request, "hola", "Carrito actual");
    expectTopic(overview.body, "cart", "overview");
    const other = await chatContext.request.post("/api/rag/chat", { data: { message: "hola", scope: "cualquier cosa" } });
    expectFixedReply((await other.json()) as ChatAnswer, "unknown");
  });

  test("the unknown reply is not an error: it carries the lead and the capability line in every field", async ({ chatContext }) => {
    const { body } = await ask(chatContext.request, "¿Qué hago ahora?");
    expect(body).toMatchObject({ answer: buildAnswer({ kind: "unknown", lead: [{ text: UNKNOWN_LEAD }], body: CAPABILITY_LINE }).answer, context_used: "Todo el sistema" });
  });
});

test.describe("input limits (REQ-10 server)", () => {
  const post = (chatContext: BrowserContext, message: unknown) => chatContext.request.post("/api/rag/chat", { data: { message } });

  test("a message of 501 characters is rejected with the bad-request response and no answer", async ({ chatContext }) => {
    const response = await post(chatContext, "a".repeat(501));
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid request");
    expect(body.answer).toBeUndefined();
  });

  test("a message of only spaces or empty is rejected", async ({ chatContext }) => {
    for (const message of ["   ", "", " \n\t "]) expect((await post(chatContext, message)).status(), JSON.stringify(message)).toBe(400);
  });

  test("a message of 500 characters plus surrounding spaces is answered", async ({ chatContext }) => {
    const response = await post(chatContext, `  ${"a".repeat(500)}  `);
    expect(response.status()).toBe(200);
    expect(((await response.json()) as ChatAnswer).lead.length).toBeGreaterThan(0);
  });

  test("the length is the trimmed one: 501 characters after trimming is rejected, 500 is the limit", async ({ chatContext }) => {
    expect((await post(chatContext, ` ${"a".repeat(501)} `)).status()).toBe(400);
    expect((await post(chatContext, "a".repeat(500))).status()).toBe(200);
  });

  test("a non-string message is rejected", async ({ chatContext }) => {
    expect((await post(chatContext, 42)).status()).toBe(400);
  });
});

// The structured answers. They need the builders of Batch 2b, so this group stays red until then.
test.describe("builders", () => {
  test("REQ-1 every scope keeps the three original fields and answer is the plain-text form", async ({ chatContext }) => {
    const cases: { message: string; scope?: ScopeKey; lead: string }[] = [
      { message: "¿Qué hay en mi carrito?", lead: "Esto es lo que tienes en tu carrito." },
      { message: "¿Cuál es mi objetivo?", scope: "Plan activo", lead: `Tu objetivo: ${OBJECTIVE}` },
      { message: "¿Qué recetas hay en mi plan?", scope: "Recetario", lead: "Estas son tus recetas." },
      { message: "¿Qué ingredientes necesito comprar?", scope: "Carrito", lead: "Esto es lo que tienes en tu carrito." },
      { message: "¿Qué ingredientes lleva?", scope: "Receta", lead: "Sobre Pollo asado:" },
      { message: "¿A qué hora es la cena?", lead: "Estos son los horarios de tus comidas." },
      { message: "¿Qué hago ahora?", lead: UNKNOWN_LEAD },
      { message: "¿Qué hay en mi carrito?", scope: "Recetario", lead: UNKNOWN_LEAD }
    ];
    for (const { message, scope, lead } of cases) {
      const { status, body } = await ask(chatContext.request, message, scope, scope === "Receta" ? ids["Pollo asado"] : undefined);
      const label = `${scope ?? "auto"}: ${message}`;
      expect(status, label).toBe(200);
      expect(typeof body.answer, label).toBe("string");
      expect(typeof body.context_used, label).toBe("string");
      expect(Array.isArray(body.sources), label).toBe(true);
      expect(body.lead.length, label).toBeGreaterThan(0);
      expect(plainOf(body.lead), label).toBe(lead);
      expect(body.answer, label).toBe(buildAnswer(body).answer);
    }
  });

  test("REQ-1 an empty cart is a lead with no sections and no sources", async ({ chatContext }) => {
    seedCart(0);
    const { body } = await ask(chatContext.request, "¿Qué tengo en mi carrito?");
    expect(plainOf(body.lead)).toBe("Tu carrito está vacío.");
    expect(body.sections).toEqual([]);
    expect(body.sources).toEqual([]);
    expect(body.answer).toBe("Tu carrito está vacío.");
  });

  test("REQ-1 no active plan: the lead says so, with no sections and no sources", async ({ chatContext }) => {
    clearPlan();
    const { body } = await ask(chatContext.request, "¿Cuál es el objetivo de mi plan?");
    expect(plainOf(body.lead)).toBe("No tienes un plan activo.");
    expect(body.sections).toEqual([]);
    expect(body.sources).toEqual([]);
  });

  test("REQ-1 no recipes in Recetario with 'hola': the lead says so", async ({ chatContext }) => {
    seedRecipes([]);
    const { body } = await ask(chatContext.request, "hola", "Recetario");
    expect(plainOf(body.lead)).toBe("Aún no tienes recetas.");
    expect(body.sections).toEqual([]);
    expect(body.sources).toEqual([]);
  });

  test("REQ-1 a 40-ingredient cart shows 8 items and a last item 'y 32 más'", async ({ chatContext }) => {
    seedCart(40);
    const { body } = await ask(chatContext.request, "¿Qué tengo en mi carrito?");
    const list = items(body, "Ingredientes");
    expect(list).toHaveLength(9);
    expect(list[8]).toBe("y 32 más");
    expect(list.slice(0, 8).every((item) => item.startsWith("Ingrediente "))).toBe(true);
    expect(body.answer.split("\n")).toHaveLength(1 + 1 + 9);
  });

  test("REQ-1 the cart lists one item per ingredient with the quantity highlighted", async ({ chatContext }) => {
    const { body } = await ask(chatContext.request, "¿Qué tengo en mi carrito?");
    const section = body.sections[0];
    expect(section.title).toBe("Ingredientes");
    expect(section.items).toHaveLength(3);
    expect(section.items.map(plainOf)).toEqual(["Ingrediente 01 · 1 g", "Ingrediente 02 · 2 g", "Ingrediente 03 · 3 g"]);
    expect(section.items.map((item) => item.filter((span) => span.highlight).map((span) => span.text))).toEqual([["1 g"], ["2 g"], ["3 g"]]);
  });

  test("REQ-1 the recipe list lists all recipes, or only those matching a word of the question", async ({ chatContext }) => {
    const all = await ask(chatContext.request, "¿Qué recetas hay en mi plan?", "Recetario");
    expect(plainOf(all.body.lead)).toBe("Estas son tus recetas.");
    expect(items(all.body, "Recetas")).toEqual(["Quesadillas", "Ensalada", "Pollo asado"]);

    const filtered = await ask(chatContext.request, "¿Qué recetas hay con pollo?", "Recetario");
    expect(plainOf(filtered.body.lead)).toBe("Estas recetas coinciden con tu pregunta.");
    expect(items(filtered.body, "Recetas")).toEqual(["Pollo asado"]);
  });

  test("REQ-1 a filter word that matches no recipe lists all of them", async ({ chatContext }) => {
    const { body } = await ask(chatContext.request, "¿Qué recetas hay con pescado?", "Recetario");
    expect(plainOf(body.lead)).toBe("Estas son tus recetas.");
    expect(items(body, "Recetas")).toHaveLength(3);
  });

  test("REQ-1 in Todo the recipe list uses the same builder and caps at 8 recipes", async ({ chatContext }) => {
    seedRecipes(Array.from({ length: 10 }, (_, index) => ({ name: `Receta ${String(index + 1).padStart(2, "0")}`, ingredients: [{ name: "Sal" }] })));
    const { body } = await ask(chatContext.request, "¿Qué recetas tengo?");
    const list = items(body, "Recetas");
    expect(list).toHaveLength(9);
    expect(list[8]).toBe("y 2 más");
  });

  test("REQ-1 'Esta receta' for '¿Cuánto pollo lleva?' lists only the pollo ingredients and no preparation", async ({ chatContext }) => {
    const { body } = await ask(chatContext.request, "¿Cuánto pollo lleva?", "Receta", ids["Pollo asado"]);
    expect(plainOf(body.lead)).toBe("Sobre Pollo asado:");
    expect(body.sections.map((section) => section.title)).toEqual(["Ingredientes"]);
    expect(items(body, "Ingredientes")).toEqual(["Pechuga de pollo · 200 g"]);
    expect(body.sections[0].items[0].find((span) => span.highlight)?.text).toBe("200 g");
  });

  test("REQ-1 'Esta receta' without a named ingredient lists all of them and the preparation steps", async ({ chatContext }) => {
    const { body } = await ask(chatContext.request, "¿Qué lleva y cómo se hace?", "Receta", ids["Pollo asado"]);
    expect(body.sections.map((section) => section.title)).toEqual(["Ingredientes", "Preparación"]);
    expect(items(body, "Ingredientes")).toEqual(["Pechuga de pollo · 200 g", "Limón · 1 pza", "Aceite de oliva · 10 ml"]);
    expect(items(body, "Preparación")).toEqual(["Sazonar el pollo.", "Asar 20 minutos."]);
  });

  test("REQ-1 'Esta receta' asked about preparation shows only the steps", async ({ chatContext }) => {
    const { body } = await ask(chatContext.request, "¿Cómo se prepara?", "Receta", ids["Pollo asado"]);
    expect(body.sections.map((section) => section.title)).toEqual(["Preparación"]);
  });

  test("REQ-1 the plan lists the meals, plus supplements and recommendations only when the question names them", async ({ chatContext }) => {
    const plain = await ask(chatContext.request, "¿Cuál es mi objetivo?", "Plan activo");
    expect(plainOf(plain.body.lead)).toBe(`Tu objetivo: ${OBJECTIVE}`);
    expect(plain.body.sections.map((section) => section.title)).toEqual(["Comidas"]);
    expect(items(plain.body, "Comidas")).toEqual(MEALS);

    const both = await ask(chatContext.request, "¿Qué suplementos y recomendaciones tengo en mi plan?", "Plan activo");
    expect(both.body.sections.map((section) => section.title)).toEqual(["Comidas", "Suplementos", "Recomendaciones"]);
    expect(items(both.body, "Suplementos")).toEqual(["Vitamina D"]);
    expect(items(both.body, "Recomendaciones")).toEqual(["Tomar agua durante el día"]);
  });

  test("REQ-1 a plan with no supplements says so", async ({ chatContext }) => {
    seedPlan({ times: "all", supplements: false });
    const { body } = await ask(chatContext.request, "¿Qué suplementos tomo?", "Plan activo");
    expect(items(body, "Suplementos")).toEqual(["Sin suplementos registrados"]);
  });

  test("REQ-3 sources list only the data used, and none on unknown, out-of-scope or empty-state replies", async ({ chatContext }) => {
    const sourcesOf = async (message: string, scope?: ScopeKey, recipeId?: string) => (await ask(chatContext.request, message, scope, recipeId)).body.sources;
    expect(await sourcesOf("¿Qué hay en mi carrito?")).toEqual(["Carrito actual"]);
    expect(await sourcesOf("¿Qué hay en mi carrito?", "Carrito")).toEqual(["Carrito actual"]);
    expect(await sourcesOf("¿Cuál es mi objetivo?")).toEqual([`Plan activo: ${PLAN_NAME}`]);
    expect(await sourcesOf("¿A qué hora es la cena?")).toEqual([`Plan activo: ${PLAN_NAME}`]);
    expect(await sourcesOf("¿Qué recetas hay en mi plan?")).toEqual(["Recetario"]);
    expect(await sourcesOf("¿Qué ingredientes lleva?", "Receta", ids["Pollo asado"])).toEqual(["Receta: Pollo asado"]);
    expect(await sourcesOf("hola", "Plan activo")).toEqual([`Plan activo: ${PLAN_NAME}`]);

    expect(await sourcesOf("¿Qué hago ahora?")).toEqual([]);
    expect(await sourcesOf("¿Qué hay en mi carrito?", "Recetario")).toEqual([]);

    seedCart(0);
    clearPlan();
    seedRecipes([]);
    expect(await sourcesOf("¿Qué hay en mi carrito?")).toEqual([]);
    expect(await sourcesOf("¿Cuál es mi objetivo?")).toEqual([]);
    expect(await sourcesOf("¿A qué hora es la cena?")).toEqual([]);
    expect(await sourcesOf("hola", "Recetario")).toEqual([]);
  });

  test("REQ-18 with an active plan and times, there is one item per meal and each time is highlighted", async ({ chatContext }) => {
    const { body } = await ask(chatContext.request, "¿A qué hora es la cena?");
    expectTopic(body, "mealTimes");
    expect(plainOf(body.lead)).toBe("Estos son los horarios de tus comidas.");
    expect(body.sections.map((section) => section.title)).toEqual(["Comidas"]);
    expect(items(body, "Comidas")).toEqual(["Desayuno · Entre 7 a 8 am", "Colación · Entre 10 a 11 am", "Comida · Entre 2 a 3 pm", "Cena · Entre 8 a 9 pm"]);
    expect(body.sections[0].items.map((item) => item.filter((span) => span.highlight).map((span) => span.text))).toEqual([
      ["Entre 7 a 8 am"],
      ["Entre 10 a 11 am"],
      ["Entre 2 a 3 pm"],
      ["Entre 8 a 9 pm"]
    ]);
  });

  test("REQ-18 with only some times, every meal is listed and only those with a time are highlighted", async ({ chatContext }) => {
    seedPlan({ times: "some" });
    const { body } = await ask(chatContext.request, "¿Cuál es mi horario?");
    expect(items(body, "Comidas")).toEqual(["Desayuno · Entre 7 a 8 am", "Colación", "Comida · Entre 2 a 3 pm", "Cena"]);
    expect(body.sections[0].items.map((item) => item.some((span) => span.highlight))).toEqual([true, false, true, false]);
  });

  test("REQ-18 without meal times the lead says so and the meals are listed without highlights", async ({ chatContext }) => {
    seedPlan({ times: "none" });
    const { body } = await ask(chatContext.request, "¿Cuándo desayuno?");
    expectTopic(body, "mealTimes");
    expect(plainOf(body.lead)).toBe("Tu plan no tiene horarios para tus comidas.");
    expect(items(body, "Comidas")).toEqual(MEALS);
    expect(body.sections[0].items.flat().some((span) => span.highlight)).toBe(false);
  });

  test("REQ-18 without an active plan the lead says so, there are no sections, and the follow-ups still show", async ({ chatContext }) => {
    clearPlan();
    const { body } = await ask(chatContext.request, "¿Cuál es mi horario?");
    expect(plainOf(body.lead)).toBe("No tienes un plan activo.");
    expect(body.sections).toEqual([]);
    expectTopic(body, "mealTimes");
  });

  test("REQ-20 the overviews show the content of their scope", async ({ chatContext }) => {
    const plan = await ask(chatContext.request, "hola", "Plan activo");
    expect(plainOf(plan.body.lead)).toBe(`Tu objetivo: ${OBJECTIVE}`);
    expect(items(plan.body, "Comidas")).toEqual(MEALS);

    const cart = await ask(chatContext.request, "hola", "Carrito");
    expect(plainOf(cart.body.lead)).toBe("Esto es lo que tienes en tu carrito.");
    expect(items(cart.body, "Ingredientes")).toHaveLength(3);

    const recipes = await ask(chatContext.request, "hola", "Recetario");
    expect(plainOf(recipes.body.lead)).toBe("Estas son tus recetas.");
    expect(items(recipes.body, "Recetas")).toEqual(["Quesadillas", "Ensalada", "Pollo asado"]);

    const recipe = await ask(chatContext.request, "hola", "Receta", ids["Pollo asado"]);
    expect(plainOf(recipe.body.lead)).toBe("Sobre Pollo asado:");
  });

  test("REQ-5 every follow-up of the Topics table, asked in its own scope, is answered and never the unknown reply", async ({ chatContext }) => {
    const seen = new Set<string>();
    for (const list of Object.values(FOLLOW_UPS)) {
      for (const { text, scope } of list) {
        const key = `${scope}|${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { status, body } = await ask(chatContext.request, text, scope, scope === "Receta" ? ids["Pollo asado"] : undefined);
        expect(status, key).toBe(200);
        expect(body.kind, key).toBe("answer");
      }
    }
    expect(seen.size).toBe(7);
  });

  test("REQ-5 the page suggestions, asked in their own scopes, are answered", async ({ chatContext }) => {
    const suggestions: [string, ScopeKey][] = [
      ["¿Qué recetas hay en mi plan?", "Recetario"],
      ["¿Qué tengo en mi carrito?", "Carrito"],
      ["¿Qué ingredientes necesito comprar?", "Carrito"]
    ];
    for (const [text, scope] of suggestions) expect((await ask(chatContext.request, text, scope)).body.kind, text).toBe("answer");
    const protein = await ask(chatContext.request, "¿Cuánto pollo lleva?", "Receta", ids["Pollo asado"]);
    expect(protein.body.kind).toBe("overview");
  });
});
