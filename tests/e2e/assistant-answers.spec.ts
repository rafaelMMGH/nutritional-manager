import type { Page } from "@playwright/test";
import { expectIssues } from "./fixtures";
import { UNKNOWN_ANSWER, assistantUi, buildAnswer, cartAnswer, createChatUser, deleteChatUser, expect, mockChat, openAssistant, seedCart, seedPlan, seedRecipes, test } from "./assistant-helpers";

// UI tests of what an answer turn shows. Spec assistant-chat-polish: REQ-4 (scope label) and the REQ-12 defaults
// (the scope a typed question is asked in on each page), and the structured content of a turn (REQ-2, REQ-3, REQ-18 UI).

let recipeId = "";

test.beforeAll(() => {
  createChatUser("answers");
  recipeId = seedRecipes([{ name: "Pollo asado", ingredients: [{ name: "Pechuga de pollo", quantity: 200, category: "Proteínas" }] }])["Pollo asado"];
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
    await expect(turn.getByText(/^Basado en:/)).toHaveText("Basado en: Recetario, Carrito actual, Receta: Pollo asado");
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
