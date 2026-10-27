import type { Page } from "@playwright/test";
import { expectIssues } from "./fixtures";
import {
  UNKNOWN_ANSWER,
  assistantUi,
  cartAnswer,
  createChatUser,
  deleteChatUser,
  expect,
  mockChat,
  openAssistant,
  seedCart,
  seedPlan,
  seedRecipes,
  softDeleteRecipe,
  test
} from "./assistant-helpers";

// UI tests of the next step after a question. Spec assistant-chat-polish, US2: REQ-5 (chips), REQ-6 (unknown reply), the
// UI of REQ-20 (out-of-scope and missing-recipe replies), REQ-7 ("Pensando…") and REQ-8 (error, Reintentar, the 15 s timeout).

const RECIPES_CHIP = "¿Qué recetas hay en mi plan?";
const CART_CHIP = "¿Qué tengo en mi carrito?";
const BUY_CHIP = "¿Qué ingredientes necesito comprar?";
const ASK_ALL = "Preguntar en Todo";
const API = /\/api\/rag\/chat$/;

let ids: Record<string, string> = {};

test.beforeAll(() => {
  createChatUser("next-step");
  ids = seedRecipes([
    {
      name: "Pollo asado",
      description: "Sazonar el pollo.\nAsar 20 minutos.",
      ingredients: [{ name: "Pechuga de pollo", quantity: 200, category: "Proteínas" }, { name: "Arroz", quantity: 100 }]
    },
    { name: "Ensalada", ingredients: [{ name: "Lechuga", quantity: 100 }] },
    { name: "Efímera", ingredients: [{ name: "Tomate", quantity: 50 }] }
  ]);
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

/** Asks from the dashboard search bar, in the scope the bar offers. It opens the panel itself, and the open panel covers the bar's menu. */
async function askFromSearchBar(page: Page, scope: string, message: string) {
  await page.getByRole("button", { name: "Buscar en: Todo" }).click();
  await page.getByRole("menuitemradio", { name: scope }).click();
  const search = page.getByRole("search").getByLabel("Preguntar al asistente");
  await search.fill(message);
  await search.press("Enter");
}

/** The label of every finished assistant turn, in thread order. */
async function labelsOf(page: Page) {
  const ui = assistantUi(page);
  await expect(ui.pending).toHaveCount(0);
  return ui.assistantTurns.locator(".assistant-turn-label").allTextContents();
}

test.describe("REQ-5: chips under the latest answer", () => {
  test("only the latest answer has chips, outside the live region, and activating one moves them", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, CART_CHIP);
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.chips).toHaveText([RECIPES_CHIP, "¿A qué hora es mi comida?"]);
    await expect(ui.live.locator(".assistant-chips")).toHaveCount(0);
    await expect(ui.assistantTurns.nth(0).locator(".assistant-chips button")).toHaveCount(2);

    await ui.chips.first().click();
    await expect(ui.assistantTurns).toHaveCount(2);
    await expect(ui.userTurns).toHaveText([CART_CHIP, RECIPES_CHIP]);
    await expect(ui.assistantTurns.nth(0).locator(".assistant-chips")).toHaveCount(0);
    await expect(ui.assistantTurns.nth(1).locator(".assistant-chips button")).toHaveText(["¿Qué hay en mi carrito?", "¿A qué hora es mi comida?"]);
    await expect(ui.chips).toHaveCount(2);
  });

  test("every chip is disabled while a request is pending and activating one sends nothing", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, CART_CHIP);
    await expect(ui.chips).toHaveCount(2);

    const mock = await mockChat(chat, cartAnswer(), { hold: true });
    await typeQuestion(chat, "una pregunta más");
    await expect(ui.pending).toHaveCount(1);
    await expect(ui.chips).toHaveCount(2);
    await expect(ui.chips.first()).toBeDisabled();
    await expect(ui.chips.last()).toBeDisabled();
    await ui.chips.first().click({ force: true });
    expect(mock.requests).toHaveLength(1);

    mock.release();
    await expect(ui.pending).toHaveCount(0);
    await expect(ui.chips.first()).toBeEnabled();
    expect(mock.requests).toHaveLength(1);
  });

  test("a groceries chip is asked in its own scope and labelled with it", async ({ chat }) => {
    await chat.goto("/groceries/cart");
    const ui = await openAssistant(chat);
    await expect(ui.chips).toHaveText([CART_CHIP, BUY_CHIP, RECIPES_CHIP]);
    const request = chat.waitForRequest(API);
    await ui.chips.nth(2).click();
    expect((await request).postDataJSON()).toMatchObject({ message: RECIPES_CHIP, scope: "Recetario" });
    await expect(ui.assistantTurns.getByRole("heading", { level: 3 })).toHaveText(["Recetas"]);
    expect(await labelsOf(chat)).toEqual(["Recetario"]);
  });

  test("the cart chip of a recipe page is labelled Carrito", async ({ chat }) => {
    await chat.goto(`/recipes/${ids["Pollo asado"]}`);
    const ui = await openAssistant(chat);
    const request = chat.waitForRequest(API);
    await ui.panel.getByRole("button", { name: CART_CHIP }).click();
    const body = (await request).postDataJSON();
    expect(body.scope).toBe("Carrito");
    expect(body.recipe_id).toBeUndefined();
    await expect(ui.assistantTurns).toHaveCount(1);
    expect(await labelsOf(chat)).toEqual(["Carrito"]);
  });

  test("a recipe with a protein offers the protein chip, which answers with only that ingredient", async ({ chat }) => {
    await chat.goto(`/recipes/${ids["Pollo asado"]}`);
    const ui = await openAssistant(chat);
    await expect(ui.chips).toHaveText(["¿Qué ingredientes lleva?", "¿Cómo se prepara?", "¿Cuánto pechuga de pollo lleva?", CART_CHIP]);
    const request = chat.waitForRequest(API);
    await ui.chips.nth(2).click();
    expect((await request).postDataJSON()).toMatchObject({ scope: "Receta", recipe_id: ids["Pollo asado"] });
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.assistantTurns.getByRole("heading", { level: 3 })).toHaveText(["Ingredientes"]);
    await expect(ui.assistantTurns.getByRole("listitem")).toHaveText(["Pechuga de pollo · 200 g"]);
    expect(await labelsOf(chat)).toEqual(["Esta receta"]);
  });

  test("a recipe without a protein has no protein chip and three suggestions", async ({ chat }) => {
    await chat.goto(`/recipes/${ids["Ensalada"]}`);
    const ui = await openAssistant(chat);
    await expect(ui.chips).toHaveText(["¿Qué ingredientes lleva?", "¿Cómo se prepara?", CART_CHIP]);
  });

  test("Esta receta follow-ups keep the recipe, and the question just asked is not offered again", async ({ chat }) => {
    await chat.goto(`/recipes/${ids["Pollo asado"]}`);
    const ui = await openAssistant(chat);
    await typeQuestion(chat, "¿Qué ingredientes lleva?");
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.chips).toHaveText(["¿Cómo se prepara?", "¿Qué hay en mi carrito?"]);

    const request = chat.waitForRequest(API);
    await ui.chips.first().click();
    expect((await request).postDataJSON()).toMatchObject({ message: "¿Cómo se prepara?", scope: "Receta", recipe_id: ids["Pollo asado"] });
  });

  test("a follow-up in a narrowed scope that repeats the question leaves the other two", async ({ chat }) => {
    await chat.goto("/");
    const ui = assistantUi(chat);
    await askFromSearchBar(chat, "Plan activo", "¿Qué suplementos tomo?");
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.chips).toHaveText(["¿A qué hora es mi comida?", RECIPES_CHIP]);
  });

  test("an unknown reply that repeats a suggestion fills the slot from the rest of the page list", async ({ chat }) => {
    // The server cannot answer a suggestion with the unknown reply, so the unknown reply is mocked to test the rule itself.
    await mockChat(chat, UNKNOWN_ANSWER);
    await chat.goto(`/recipes/${ids["Pollo asado"]}`);
    const ui = await openAssistant(chat);
    await typeQuestion(chat, "que ingredientes lleva");
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.chips).toHaveText(["¿Cómo se prepara?", "¿Cuánto pechuga de pollo lleva?", CART_CHIP]);
  });
});

test.describe("REQ-6: the unknown reply in Todo", () => {
  test("shows the lead, the capability line and the three page suggestions, and is not an error", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, "¿Cuál es la capital de Francia?");
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.assistantTurns.getByRole("paragraph")).toHaveText([
      "No encontré eso en tu información.",
      "Puedo ayudarte con tu plan de comidas y horarios, tus recetas e ingredientes, y tu lista de compras."
    ]);
    await expect(ui.chips).toHaveText([RECIPES_CHIP, CART_CHIP, BUY_CHIP]);
    await expect(ui.panel).not.toContainText("No pude responder");
    expect(await labelsOf(chat)).toEqual(["Todo"]);
  });
});

test.describe("REQ-20: strict scopes", () => {
  test("a question the scope does not answer offers Preguntar en Todo and two suggestions; Preguntar en Todo asks it again in Todo", async ({ chat }) => {
    await chat.goto("/");
    const ui = assistantUi(chat);
    await askFromSearchBar(chat, "Recetario", CART_CHIP);
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.assistantTurns.getByRole("paragraph").first()).toHaveText("No encontré eso en tu información.");
    await expect(ui.chips).toHaveText([ASK_ALL, RECIPES_CHIP, BUY_CHIP]);

    const request = chat.waitForRequest(API);
    await ui.panel.getByRole("button", { name: ASK_ALL }).click();
    expect((await request).postDataJSON()).toEqual({ message: CART_CHIP, scope: "auto" });
    await expect(ui.assistantTurns).toHaveCount(2);
    await expect(ui.userTurns).toHaveText([CART_CHIP, CART_CHIP]);
    await expect(ui.assistantTurns.nth(1).getByRole("listitem")).toHaveCount(3);
    expect(await labelsOf(chat)).toEqual(["Recetario", "Todo"]);
  });

  test("a suggestion on an out-of-scope reply is asked in its own scope", async ({ chat }) => {
    await chat.goto("/");
    const ui = assistantUi(chat);
    await askFromSearchBar(chat, "Recetario", CART_CHIP);
    await expect(ui.chips).toHaveText([ASK_ALL, RECIPES_CHIP, BUY_CHIP]);
    await ui.panel.getByRole("button", { name: BUY_CHIP }).click();
    await expect(ui.assistantTurns).toHaveCount(2);
    expect(await labelsOf(chat)).toEqual(["Recetario", "Carrito"]);
  });

  test("a deleted recipe gets the unknown reply with the three dashboard chips and no Preguntar en Todo", async ({ chat }) => {
    await chat.goto(`/recipes/${ids["Efímera"]}`);
    const ui = await openAssistant(chat);
    softDeleteRecipe(ids["Efímera"]);
    await typeQuestion(chat, "¿Qué ingredientes lleva?");
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.assistantTurns.getByRole("paragraph").first()).toHaveText("No encontré eso en tu información.");
    await expect(ui.chips).toHaveText([RECIPES_CHIP, CART_CHIP, BUY_CHIP]);
    await expect(ui.panel.getByRole("button", { name: ASK_ALL })).toHaveCount(0);
  });

  test("an Esta receta chip still answers about its recipe after navigating to another page", async ({ chat }) => {
    await chat.goto(`/recipes/${ids["Pollo asado"]}`);
    const ui = await openAssistant(chat);
    await typeQuestion(chat, "¿Qué ingredientes lleva?");
    await expect(ui.chips).toHaveText(["¿Cómo se prepara?", "¿Qué hay en mi carrito?"]);

    // An in-app link keeps the shell, and with it the thread, mounted.
    await chat.getByRole("link", { name: "Hoy" }).click();
    await expect(chat).toHaveURL(/\/$/);
    await expect(ui.chips).toHaveCount(2);

    const request = chat.waitForRequest(API);
    await ui.chips.first().click();
    expect((await request).postDataJSON()).toMatchObject({ message: "¿Cómo se prepara?", scope: "Receta", recipe_id: ids["Pollo asado"] });
    await expect(ui.assistantTurns).toHaveCount(2);
    await expect(ui.assistantTurns.nth(1).getByRole("listitem")).toHaveText(["Sazonar el pollo.", "Asar 20 minutos."]);
    expect(await labelsOf(chat)).toEqual(["Esta receta", "Esta receta"]);
  });
});

const THINKING = "Pensando…";
const ERROR_COPY = "No pude responder en este momento.";
const FAILED_500 = [/POST \/api\/rag\/chat → 500/, /Failed to load resource.*500/];
const retryButton = (page: Page) => page.getByRole("button", { name: "Reintentar" });

test.describe("REQ-7: Pensando…", () => {
  test("shows in the answer position while the request is pending, outside the live region, and is gone afterwards", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer(2), { hold: true });
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, CART_CHIP);
    await expect(ui.pending).toHaveCount(1);
    await expect(ui.pending).toContainText(THINKING);
    await expect(ui.userTurns).toHaveText([CART_CHIP]);
    await expect(ui.live.filter({ hasText: THINKING })).toHaveCount(0);

    mock.release();
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.pending).toHaveCount(0);
    await expect(ui.panel).not.toContainText(THINKING);
  });
});

test.describe("REQ-8: error, Reintentar and the 15 s timeout", () => {
  test.describe("a 500 answer", () => {
    test.use({ expectedIssues: expectIssues(...FAILED_500) });

    test("keeps the question, shows the error with Reintentar and no chips; Reintentar swaps it for Pensando… and then the answer", async ({ chat }) => {
      await mockChat(chat, cartAnswer(), { status: 500 });
      await chat.goto("/");
      const ui = await openAssistant(chat);
      await typeQuestion(chat, CART_CHIP);
      await expect(ui.assistantTurns).toHaveCount(1);
      await expect(ui.assistantTurns.first()).toContainText(ERROR_COPY);
      await expect(ui.live).toHaveText([ERROR_COPY]);
      await expect(ui.userTurns).toHaveText([CART_CHIP]);
      await expect(ui.labels).toHaveCount(0);
      await expect(ui.chips).toHaveCount(0);
      await expect(retryButton(chat)).toBeVisible();
      await expect(ui.live.getByRole("button")).toHaveCount(0);

      const healthy = await mockChat(chat, cartAnswer(), { hold: true });
      await retryButton(chat).click();
      await expect(ui.pending).toHaveCount(1);
      await expect(ui.pending).toContainText(THINKING);
      await expect(ui.assistantTurns).toHaveCount(0);
      await expect(ui.panel).not.toContainText(ERROR_COPY);
      await expect(retryButton(chat)).toHaveCount(0);
      await expect(ui.userTurns).toHaveText([CART_CHIP]);

      healthy.release();
      await expect(ui.assistantTurns).toHaveCount(1);
      await expect(ui.assistantTurns.getByRole("heading", { level: 3 })).toHaveText(["Ingredientes"]);
      await expect(ui.chips).toHaveText([RECIPES_CHIP, "¿A qué hora es mi comida?"]);
      await expect(ui.panel).not.toContainText(ERROR_COPY);
      await expect(retryButton(chat)).toHaveCount(0);
      await expect(ui.userTurns).toHaveText([CART_CHIP]);
      expect(healthy.requests).toEqual([{ message: CART_CHIP, scope: "auto" }]);
    });

    test("Reintentar in Esta receta keeps its recipe", async ({ chat }) => {
      await mockChat(chat, cartAnswer(), { status: 500 });
      await chat.goto(`/recipes/${ids["Pollo asado"]}`);
      const ui = await openAssistant(chat);
      await typeQuestion(chat, "¿Qué ingredientes lleva?");
      await expect(retryButton(chat)).toBeVisible();

      const healthy = await mockChat(chat, cartAnswer());
      await retryButton(chat).click();
      await expect(ui.assistantTurns).toHaveCount(1);
      await expect(ui.chips.first()).toBeVisible();
      expect(healthy.requests).toEqual([{ message: "¿Qué ingredientes lleva?", scope: "Receta", recipe_id: ids["Pollo asado"] }]);
    });
  });

  test.describe("a retry that fails again", () => {
    test.use({ expectedIssues: expectIssues(...FAILED_500, ...FAILED_500) });

    test("shows the error again, with the question once", async ({ chat }) => {
      const mock = await mockChat(chat, cartAnswer(), { status: 500 });
      await chat.goto("/");
      const ui = await openAssistant(chat);
      await typeQuestion(chat, CART_CHIP);
      await expect(retryButton(chat)).toBeVisible();
      await retryButton(chat).click();
      await expect.poll(() => mock.requests.length).toBe(2);
      await expect(ui.pending).toHaveCount(0);
      await expect(ui.assistantTurns).toHaveCount(1);
      await expect(ui.live).toHaveText([ERROR_COPY]);
      await expect(retryButton(chat)).toBeVisible();
      await expect(ui.userTurns).toHaveText([CART_CHIP]);
      await expect(ui.chips).toHaveCount(0);
    });
  });

  test.describe("a network failure", () => {
    test.use({ expectedIssues: expectIssues(/Failed to load resource.*ERR_FAILED/) });

    test("is treated like a non-2xx answer", async ({ chat }) => {
      await mockChat(chat, cartAnswer(), { abort: true });
      await chat.goto("/");
      const ui = await openAssistant(chat);
      await typeQuestion(chat, CART_CHIP);
      await expect(ui.live).toHaveText([ERROR_COPY]);
      await expect(retryButton(chat)).toBeVisible();
      await expect(ui.userTurns).toHaveText([CART_CHIP]);
      await expect(ui.chips).toHaveCount(0);
    });
  });

  test.describe("a request pending over 15 s", () => {
    // The clock is installed before the page loads so the app's own timer is the faked one.
    test("shows the error, and a late answer is discarded", async ({ chat }) => {
      await chat.clock.install();
      const mock = await mockChat(chat, cartAnswer(), { hold: true });
      await chat.goto("/");
      const ui = await openAssistant(chat);
      await typeQuestion(chat, CART_CHIP);
      await expect(ui.pending).toHaveCount(1);

      await chat.clock.fastForward(14_000);
      await expect(ui.pending).toHaveCount(1);
      await chat.clock.fastForward(1_500);
      await expect(ui.pending).toHaveCount(0);
      await expect(ui.live).toHaveText([ERROR_COPY]);
      await expect(retryButton(chat)).toBeVisible();
      await expect(ui.userTurns).toHaveText([CART_CHIP]);

      const late = chat.waitForResponse(API);
      mock.release();
      await late;
      // A round trip into the page: the late response has been handled by now.
      await chat.evaluate(() => undefined);
      await expect(ui.live).toHaveText([ERROR_COPY]);
      await expect(ui.assistantTurns).toHaveCount(1);
      await expect(ui.chips).toHaveCount(0);
      await expect(ui.panel).not.toContainText("Esto es lo que tienes en tu carrito.");
    });

    test("Reintentar afterwards asks again and answers once", async ({ chat }) => {
      await chat.clock.install();
      await mockChat(chat, cartAnswer(), { hold: true });
      await chat.goto("/");
      const ui = await openAssistant(chat);
      await typeQuestion(chat, CART_CHIP);
      await expect(ui.pending).toHaveCount(1);
      await chat.clock.fastForward(15_500);
      await expect(retryButton(chat)).toBeVisible();

      const healthy = await mockChat(chat, cartAnswer());
      await retryButton(chat).click();
      await expect(ui.assistantTurns).toHaveCount(1);
      await expect(ui.chips).toHaveCount(2);
      await expect(ui.userTurns).toHaveText([CART_CHIP]);
      expect(healthy.requests).toHaveLength(1);
    });
  });
});

test.describe("REQ-5 with REQ-8: an error as the latest turn hides every chip", () => {
  test.use({ expectedIssues: expectIssues(...FAILED_500) });

  test("chips of the earlier answer are gone too", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, CART_CHIP);
    await expect(ui.chips).toHaveCount(2);

    await mockChat(chat, cartAnswer(), { status: 500 });
    await typeQuestion(chat, "una pregunta más");
    await expect(ui.live.last()).toHaveText(ERROR_COPY);
    await expect(chat.locator(".assistant-chips")).toHaveCount(0);
  });
});

test.describe("REQ-16: the loader under reduced motion", () => {
  const animationOf = (page: Page) => page.locator(".assistant-loader").evaluate((node) => getComputedStyle(node).animationName);

  test("blinks normally and is static text under prefers-reduced-motion", async ({ chat }) => {
    await mockChat(chat, cartAnswer(), { hold: true });
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, CART_CHIP);
    await expect(ui.pending).toContainText(THINKING);
    expect(await animationOf(chat)).not.toBe("none");

    await chat.emulateMedia({ reducedMotion: "reduce" });
    expect(await animationOf(chat)).toBe("none");
  });
});
