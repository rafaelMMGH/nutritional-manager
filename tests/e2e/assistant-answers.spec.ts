import type { Page } from "@playwright/test";
import { expectIssues } from "./fixtures";
import { UNKNOWN_ANSWER, assistantUi, createChatUser, deleteChatUser, expect, mockChat, openAssistant, seedCart, seedPlan, seedRecipes, test } from "./assistant-helpers";

// UI tests of what an answer turn shows. Spec assistant-chat-polish: REQ-4 (scope label) and the REQ-12 defaults
// (the scope a typed question is asked in on each page). Structured content (REQ-2, REQ-3) is tested with Batch 4.

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
    await ui.panel.getByRole("button", { name: "¿Qué recetas hay en mi plan?" }).click();
    await expect(ui.assistantTurns).toHaveCount(1);
    expect(await labelsOf(chat)).toEqual(["Recetario"]);

    await typeQuestion(chat, "¿Qué tengo en mi carrito?");
    await expect(ui.assistantTurns).toHaveCount(2);
    expect(await labelsOf(chat)).toEqual(["Recetario", "Todo"]);
  });

  test("a search-bar question with Carrito is labelled Carrito", async ({ chat }) => {
    await chat.goto("/");
    await chat.getByRole("button", { name: "Buscar en: Todo" }).click();
    await chat.getByRole("menuitemradio", { name: "Carrito" }).click();
    const search = chat.getByRole("search").getByLabel("Preguntar al asistente");
    await search.fill("¿Qué tengo en mi carrito?");
    await search.press("Enter");

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
    { name: "the dashboard", path: () => "/", label: "Todo" },
    { name: "groceries", path: () => "/groceries/cart", label: "Carrito" },
    { name: "a recipe page", path: () => `/recipes/${recipeId}`, label: "Esta receta" }
  ];
  for (const { name, path, label } of pages) {
    test(`on ${name} the label is ${label}`, async ({ chat }) => {
      await chat.goto(path());
      const ui = await openAssistant(chat);
      await typeQuestion(chat, "¿Qué tengo en mi carrito?");
      await expect(ui.assistantTurns).toHaveCount(1);
      expect(await labelsOf(chat)).toEqual([label]);
    });
  }
});
