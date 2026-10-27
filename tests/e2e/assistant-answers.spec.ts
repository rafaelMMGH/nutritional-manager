import type { Locator, Page } from "@playwright/test";
import { expectIssues } from "./fixtures";
import { auditNow, visit } from "./theme-audit";
import { UNKNOWN_ANSWER, assistantUi, buildAnswer, cartAnswer, createChatUser, deleteChatUser, expect, mockChat, openAssistant, seedCart, seedPlan, seedRecipes, test } from "./assistant-helpers";

// UI tests of what an answer turn shows. Spec assistant-chat-polish: REQ-4 (scope label) and the REQ-12 defaults
// (the scope a typed question is asked in on each page), and the structured content of a turn (REQ-2, REQ-3, REQ-18 UI).

let recipeId = "";
let otherRecipeId = "";

test.beforeAll(() => {
  createChatUser("answers");
  const ids = seedRecipes([
    { name: "Pollo asado", ingredients: [{ name: "Pechuga de pollo", quantity: 200, category: "Proteínas" }] },
    // The Recetario list shows only dishes with more than one ingredient.
    { name: "Ensalada verde", ingredients: [{ name: "Lechuga", quantity: 100 }, { name: "Aguacate", quantity: 50 }] }
  ]);
  recipeId = ids["Pollo asado"];
  otherRecipeId = ids["Ensalada verde"];
  seedPlan({ times: "all" });
  seedCart(3);
});
test.afterAll(() => deleteChatUser());

/** Types `message` in the panel input and sends it. */
async function typeQuestion(page: Page, message: string) {
  const ui = assistantUi(page);
  await ui.input.fill(message);
  await ui.send.click();
}

/** The label of every finished assistant turn, in thread order. */
async function labelsOf(page: Page) {
  const ui = assistantUi(page);
  await expect(ui.pending).toHaveCount(0);
  return ui.assistantTurns.locator(".assistant-turn-label").allTextContents();
}

test.describe("REQ-4: the answer is labelled with the scope it was asked in", () => {
  test("a Recetario answer is labelled Recetario and the earlier label is kept", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openAssistant(chat);
    // The dashboard suggestion "¿Qué recetas hay en mi plan?" is asked in Recetario, whatever the default scope is.
    const request = chat.waitForRequest(/\/api\/rag\/chat$/);
    await ui.panel.getByRole("button", { name: "¿Qué recetas hay en mi plan?" }).click();
    expect((await request).postDataJSON()).toMatchObject({ scope: "Recetario" });
    await expect(ui.assistantTurns).toHaveCount(1);
    expect(await labelsOf(chat)).toEqual(["Recetario"]);

    const typed = chat.waitForRequest(/\/api\/rag\/chat$/);
    await typeQuestion(chat, "¿Qué tengo en mi carrito?");
    expect((await typed).postDataJSON()).toMatchObject({ scope: "auto" });
    await expect(ui.assistantTurns).toHaveCount(2);
    expect(await labelsOf(chat)).toEqual(["Recetario", "Todo"]);
  });

  test("a search-bar question with Carrito is labelled Carrito", async ({ chat }) => {
    await chat.goto("/");
    await chat.getByRole("button", { name: "Buscar en: Todo" }).click();
    await chat.getByRole("menuitemradio", { name: "Carrito" }).click();
    const search = chat.getByRole("search").getByLabel("Preguntar al asistente");
    await search.fill("¿Qué tengo en mi carrito?");
    const request = chat.waitForRequest(/\/api\/rag\/chat$/);
    await search.press("Enter");
    expect((await request).postDataJSON()).toMatchObject({ scope: "Carrito" });

    const ui = assistantUi(chat);
    await expect(ui.assistantTurns).toHaveCount(1);
    expect(await labelsOf(chat)).toEqual(["Carrito"]);
  });

  test.describe("a failed request", () => {
    test.use({ expectedIssues: expectIssues(/POST \/api\/rag\/chat → 500/, /Failed to load resource.*500/) });

    test("gives an error turn with no label", async ({ chat }) => {
      await mockChat(chat, UNKNOWN_ANSWER, { status: 500 });
      await chat.goto("/");
      const ui = await openAssistant(chat);
      await typeQuestion(chat, "¿Qué tengo en mi carrito?");

      await expect(ui.assistantTurns).toHaveCount(1);
      await expect(ui.assistantTurns.locator(".assistant-turn-live")).toHaveText("No pude responder en este momento.");
      await expect(ui.labels).toHaveCount(0);
      await expect(ui.userTurns).toHaveText("¿Qué tengo en mi carrito?");
    });
  });
});

test.describe("REQ-12: a typed question is asked in the page's default scope", () => {
  const pages = [
    { name: "the dashboard", path: () => "/", label: "Todo", scope: "auto", recipe: () => undefined },
    { name: "groceries", path: () => "/groceries/cart", label: "Carrito", scope: "Carrito", recipe: () => undefined },
    { name: "a recipe page", path: () => `/recipes/${recipeId}`, label: "Esta receta", scope: "Receta", recipe: () => recipeId }
  ];
  for (const { name, path, label, scope, recipe } of pages) {
    test(`on ${name} the label is ${label}`, async ({ chat }) => {
      await chat.goto(path());
      const ui = await openAssistant(chat);
      const request = chat.waitForRequest(/\/api\/rag\/chat$/);
      await typeQuestion(chat, "¿Qué tengo en mi carrito?");
      const body = (await request).postDataJSON();
      expect(body.scope).toBe(scope);
      expect(body.recipe_id).toBe(recipe());
      await expect(ui.assistantTurns).toHaveCount(1);
      expect(await labelsOf(chat)).toEqual([label]);
    });
  }
});

test.describe("REQ-2, REQ-3, REQ-18: an answer shows exactly its structure", () => {
  /** Asks one question against a mocked answer and returns the finished turn. */
  async function answerTurn(chat: Page, answer: Parameters<typeof mockChat>[1]) {
    await mockChat(chat, answer);
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, "¿Qué tengo en mi carrito?");
    await expect(ui.assistantTurns).toHaveCount(1);
    return ui.assistantTurns.first();
  }

  test("a cart answer has one h3 below the panel h2, one li per item and highlighted quantities", async ({ chat }) => {
    const turn = await answerTurn(chat, cartAnswer(3));
    await expect(assistantUi(chat).panel.getByRole("heading", { level: 2 })).toHaveCount(1);
    await expect(turn.getByRole("heading", { level: 3 })).toHaveText(["Ingredientes"]);
    await expect(turn.getByRole("paragraph").first()).toHaveText("Esto es lo que tienes en tu carrito.");
    await expect(turn.getByRole("listitem")).toHaveText(["Ingrediente 01 · 1 g", "Ingrediente 02 · 2 g", "Ingrediente 03 · 3 g"]);
    const strong = turn.locator("strong");
    await expect(strong).toHaveText(["1 g", "2 g", "3 g"]);
    for (const weight of await strong.evaluateAll((nodes) => nodes.map((node) => Number(getComputedStyle(node).fontWeight)))) expect(weight).toBeGreaterThanOrEqual(600);
  });

  test("the items are a bulleted list, so the bullets show and the list keeps its semantics", async ({ chat }) => {
    const turn = await answerTurn(chat, cartAnswer(2));
    const list = turn.getByRole("list");
    await expect(list).toHaveCount(1);
    await expect(list).toHaveCSS("list-style-type", "disc");
    expect(await list.evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft))).toBeGreaterThan(0);
  });

  test("text only in `answer` is not shown as a heading, item or highlight", async ({ chat }) => {
    const answer = { ...cartAnswer(2), answer: "SOLO EN ANSWER" };
    const turn = await answerTurn(chat, answer);
    await expect(turn.getByRole("heading", { level: 3 })).toHaveText(["Ingredientes"]);
    await expect(turn.getByRole("listitem")).toHaveCount(2);
    await expect(turn).not.toContainText("SOLO EN ANSWER");
  });

  test("an answer with sources ends with a muted line listing every source", async ({ chat }) => {
    const answer = buildAnswer({ lead: [{ text: "Sobre algo:" }], sources: ["Recetario", "Carrito actual", "Receta: Pollo asado"] });
    const turn = await answerTurn(chat, answer);
    const sources = turn.getByText(/^Basado en:/);
    await expect(sources).toHaveText("Basado en: Recetario, Carrito actual, Receta: Pollo asado");
    // "Muted" must be visible in the styles, not only in the name: the line is paler than the lead.
    const colorOf = (locator: Locator) => locator.evaluate((node) => getComputedStyle(node).color);
    expect(await colorOf(sources)).not.toBe(await colorOf(turn.locator(".assistant-turn-lead")));
  });

  test("no 'Basado en' line without sources or on the unknown reply", async ({ chat }) => {
    const empty = await answerTurn(chat, buildAnswer({ lead: [{ text: "Tu carrito está vacío." }] }));
    await expect(empty).not.toContainText("Basado en");
    await expect(empty.getByRole("heading")).toHaveCount(0);
    await expect(empty.getByRole("listitem")).toHaveCount(0);

    const unknown = await answerTurn(chat, UNKNOWN_ANSWER);
    await expect(unknown).not.toContainText("Basado en");
    await expect(unknown.getByRole("paragraph")).toHaveText(["No encontré eso en tu información.", "Puedo ayudarte con tu plan de comidas y horarios, tus recetas e ingredientes, y tu lista de compras."]);
  });

  test("meal times show one item per meal with highlighted times (real API)", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, "¿A qué hora es mi comida?");
    const turn = ui.assistantTurns.first();
    await expect(turn.getByRole("heading", { level: 3 })).toHaveText(["Comidas"]);
    await expect(turn.getByRole("listitem")).toHaveText(["Desayuno · Entre 7 a 8 am", "Colación · Entre 10 a 11 am", "Comida · Entre 2 a 3 pm", "Cena · Entre 8 a 9 pm"]);
    await expect(turn.locator("strong")).toHaveText(["Entre 7 a 8 am", "Entre 10 a 11 am", "Entre 2 a 3 pm", "Entre 8 a 9 pm"]);
    await expect(turn).toContainText("Basado en: Plan activo:");
  });
});

test.describe("REQ-12 on navigation: a typed question follows the page it is asked on (in-app links)", () => {
  /** Sends a typed question from the current page and returns the body of the request it caused. */
  async function typedRequest(chat: Page, mock: Awaited<ReturnType<typeof mockChat>>) {
    const before = mock.requests.length;
    await typeQuestion(chat, "¿Qué tengo en mi carrito?");
    await expect.poll(() => mock.requests.length).toBe(before + 1);
    await expect(assistantUi(chat).pending).toHaveCount(0);
    return mock.requests[before];
  }

  test("recipe page to dashboard sends auto and no recipe_id", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer());
    await chat.goto(`/recipes/${recipeId}`);
    await openAssistant(chat);
    expect((await typedRequest(chat, mock)).scope).toBe("Receta");
    await chat.getByRole("link", { name: "Hoy" }).click();
    await expect(chat).toHaveURL(/\/$/);
    const body = await typedRequest(chat, mock);
    expect(body.scope).toBe("auto");
    expect(body.recipe_id).toBeUndefined();
  });

  test("recipe page to groceries sends Carrito", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer());
    await chat.goto(`/recipes/${recipeId}`);
    await openAssistant(chat);
    await chat.getByRole("link", { name: "Compras" }).click();
    await expect(chat).toHaveURL(/\/groceries/);
    // The page tells the panel its scope once it has rendered; the subtitle shows that it did.
    await expect(assistantUi(chat).panel.getByText("Sobre tus compras")).toBeVisible();
    const body = await typedRequest(chat, mock);
    expect(body.scope).toBe("Carrito");
    expect(body.recipe_id).toBeUndefined();
  });

  test("recipe A to recipe B sends B's recipe_id", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer());
    await chat.goto(`/recipes/${recipeId}`);
    await openAssistant(chat);
    expect((await typedRequest(chat, mock)).recipe_id).toBe(recipeId);
    await chat.getByRole("link", { name: "Recetario" }).first().click();
    await chat.getByRole("link", { name: /Ensalada verde/ }).first().click();
    await expect(chat).toHaveURL(new RegExp(`/recipes/${otherRecipeId}`));
    const body = await typedRequest(chat, mock);
    expect(body).toMatchObject({ scope: "Receta", recipe_id: otherRecipeId });
  });
});

test.describe("REQ-17: the live region", () => {
  test("a pending turn already has a visible polite region, and it holds the answer once released", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer(2), { hold: true });
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, "¿Qué tengo en mi carrito?");
    await expect(ui.pending).toHaveCount(1);
    const region = ui.pending.locator('[aria-live="polite"]');
    await expect(region).toBeAttached();
    expect(await region.evaluate((node) => getComputedStyle(node).display)).not.toBe("none");
    await expect(region).toHaveText("");

    mock.release();
    await expect(ui.pending).toHaveCount(0);
    await expect(ui.assistantTurns.locator('[aria-live="polite"]')).toContainText("Esto es lo que tienes en tu carrito.");
  });
});

test.describe("REQ-14: an answered turn meets contrast in the light theme", () => {
  test("lead, section, highlight, sources, scope label and chips", async ({ chat }) => {
    test.setTimeout(120_000);
    await mockChat(chat, { ...cartAnswer(3), sources: ["Carrito actual"] });
    await visit(chat, "/", "light");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, "¿Qué tengo en mi carrito?");
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.chips).toHaveCount(2);
    await expect(ui.assistantTurns.locator(".assistant-turn-sources")).toBeVisible();
    // The log only: the panel header subtitle, the input placeholder and its border are still below AA in light (T031 tunes them).
    const { violations } = await auditNow(chat, { scope: ".assistant-chat-log", tab: false, hover: false });
    expect(violations).toEqual([]);
  });
});
