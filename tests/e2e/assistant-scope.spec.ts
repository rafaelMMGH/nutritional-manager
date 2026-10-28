import type { Locator, Page } from "@playwright/test";
import { assistantUi, cartAnswer, createChatUser, deleteChatUser, expect, mockChat, openAssistant, seedCart, seedPlan, seedRecipes, test } from "./assistant-helpers";

// The scope switcher and the search bar's scope. Spec assistant-chat-polish, US4: REQ-12 (options, defaults, one-question
// changes, navigation), REQ-13 (a search-bar question) and REQ-21 (the segmented group on desktop, the button and listbox at 360 px).

let recipeId = "";
let otherRecipeId = "";

test.beforeAll(() => {
  createChatUser("scope");
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

const QUESTION = "¿Qué tengo en mi carrito?";
const PHONE = { width: 360, height: 740 };

/** The desktop switcher: a group named Alcance whose options are buttons exposing aria-pressed. */
const groupOf = (page: Page) => assistantUi(page).panel.getByRole("group", { name: "Alcance" });
const optionOf = (page: Page, name: string) => groupOf(page).getByRole("button", { name, exact: true });

async function typeQuestion(page: Page, message: string) {
  const ui = assistantUi(page);
  await ui.input.fill(message);
  await ui.send.click();
}

async function labelsOf(page: Page) {
  await expect(assistantUi(page).pending).toHaveCount(0);
  return assistantUi(page).assistantTurns.locator(".assistant-turn-label").allTextContents();
}

test.describe("REQ-12: the options and the default of each page", () => {
  const pages = [
    { name: "the dashboard", path: () => "/", options: ["Todo", "Plan activo", "Recetario", "Carrito"], selected: "Todo" },
    { name: "groceries", path: () => "/groceries/cart", options: ["Todo", "Plan activo", "Recetario", "Carrito"], selected: "Carrito" },
    { name: "a recipe page", path: () => `/recipes/${recipeId}`, options: ["Todo", "Plan activo", "Recetario", "Carrito", "Esta receta"], selected: "Esta receta" }
  ];
  for (const { name, path, options, selected } of pages) {
    test(`on ${name} it offers ${options.length} options and ${selected} is pressed`, async ({ chat }) => {
      await chat.goto(path());
      await openAssistant(chat);
      const buttons = groupOf(chat).getByRole("button");
      await expect(buttons).toHaveText(options);
      for (const option of options) await expect(optionOf(chat, option)).toHaveAttribute("aria-pressed", option === selected ? "true" : "false");
    });
  }
});

test.describe("REQ-12: a change applies to the next question only", () => {
  test("Recetario labels the next answer and the earlier one keeps Todo", async ({ chat }) => {
    await mockChat(chat, cartAnswer());
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    await optionOf(chat, "Recetario").click();
    await expect(optionOf(chat, "Recetario")).toHaveAttribute("aria-pressed", "true");
    await expect(optionOf(chat, "Todo")).toHaveAttribute("aria-pressed", "false");
    await typeQuestion(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(2);
    expect(await labelsOf(chat)).toEqual(["Todo", "Recetario"]);
  });

  test("pressing the selected option again keeps it selected", async ({ chat }) => {
    await chat.goto("/");
    await openAssistant(chat);
    await optionOf(chat, "Todo").click();
    await expect(optionOf(chat, "Todo")).toHaveAttribute("aria-pressed", "true");
    await expect(groupOf(chat).locator("[aria-pressed=true]")).toHaveCount(1);
  });

  test("switching to Carrito while a question is pending labels the pending answer Todo and the next Carrito", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer(), { hold: true });
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, QUESTION);
    await expect(ui.pending).toHaveCount(1);
    await optionOf(chat, "Carrito").click();
    await expect(optionOf(chat, "Carrito")).toHaveAttribute("aria-pressed", "true");
    await expect(ui.pending.locator(".assistant-turn-label")).toHaveText("Todo");
    mock.release();
    await expect(ui.assistantTurns).toHaveCount(1);
    await typeQuestion(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(2);
    expect(await labelsOf(chat)).toEqual(["Todo", "Carrito"]);
    expect(mock.requests.map((request) => request.scope)).toEqual(["auto", "Carrito"]);
  });

  test("navigating keeps the thread and the switcher takes the new page's default", async ({ chat }) => {
    await mockChat(chat, cartAnswer());
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    await optionOf(chat, "Recetario").click();
    await expect(optionOf(chat, "Recetario")).toHaveAttribute("aria-pressed", "true");
    await chat.getByRole("link", { name: "Compras" }).click();
    await expect(chat).toHaveURL(/\/groceries/);
    await expect(optionOf(chat, "Carrito")).toHaveAttribute("aria-pressed", "true");
    await expect(ui.userTurns).toHaveCount(1);
    await expect(ui.assistantTurns).toHaveCount(1);
  });

  /** After a navigation the panel may have closed; it is reopened so the switcher can be read. */
  async function reopenIfClosed(page: Page) {
    const ui = assistantUi(page);
    if (!(await ui.panel.isVisible())) await openAssistant(page);
    return ui;
  }

  test("moving between pages that share a default resets a chosen scope: the thread stays and the next request is auto", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer());
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await typeQuestion(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    await optionOf(chat, "Recetario").click();
    await expect(optionOf(chat, "Recetario")).toHaveAttribute("aria-pressed", "true");
    await chat.getByRole("link", { name: "Planes" }).first().click();
    await expect(chat).toHaveURL(/\/plans/);
    await reopenIfClosed(chat);
    await expect(optionOf(chat, "Todo")).toHaveAttribute("aria-pressed", "true");
    await expect(optionOf(chat, "Recetario")).toHaveAttribute("aria-pressed", "false");
    await expect(ui.userTurns).toHaveCount(1);
    await expect(ui.assistantTurns).toHaveCount(1);
    await typeQuestion(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(2);
    expect(mock.requests.map((request) => request.scope)).toEqual(["auto", "auto"]);
  });

  test("moving between two groceries pages resets a chosen scope to Carrito", async ({ chat }) => {
    await chat.goto("/groceries/cart");
    await openAssistant(chat);
    await optionOf(chat, "Recetario").click();
    await expect(optionOf(chat, "Recetario")).toHaveAttribute("aria-pressed", "true");
    await chat.getByRole("link", { name: /Plantillas/ }).click();
    await expect(chat).toHaveURL(/\/groceries\/templates/);
    await reopenIfClosed(chat);
    await expect(optionOf(chat, "Carrito")).toHaveAttribute("aria-pressed", "true");
    await expect(optionOf(chat, "Recetario")).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("REQ-12: recipe pages", () => {
  test("recipe A to recipe B with a picked scope: the switcher shows Esta receta and the next request sends B's recipe_id", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer());
    await chat.goto(`/recipes/${recipeId}`);
    await openAssistant(chat);
    await optionOf(chat, "Recetario").click();
    await expect(optionOf(chat, "Recetario")).toHaveAttribute("aria-pressed", "true");
    // A client-side push straight from recipe A to recipe B: no list in between and no full page load.
    await chat.evaluate((href) => (window as unknown as { next: { router: { push: (to: string) => void } } }).next.router.push(href), `/recipes/${otherRecipeId}`);
    await expect(chat).toHaveURL(new RegExp(`/recipes/${otherRecipeId}`));
    const ui = assistantUi(chat);
    // A client-side navigation keeps the panel open.
    await expect(ui.panel).toBeVisible();
    await expect(optionOf(chat, "Esta receta")).toHaveAttribute("aria-pressed", "true");
    await expect(optionOf(chat, "Recetario")).toHaveAttribute("aria-pressed", "false");
    await typeQuestion(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    expect(mock.requests[0]).toMatchObject({ scope: "Receta", recipe_id: otherRecipeId });
  });

  test("renaming the recipe re-registers the page context in place and keeps the picked scope", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer());
    await chat.goto(`/recipes/${otherRecipeId}`);
    const ui = await openAssistant(chat);
    await expect(ui.panel.locator("header p")).toHaveText("Sobre Ensalada verde");
    await optionOf(chat, "Carrito").click();
    await expect(optionOf(chat, "Carrito")).toHaveAttribute("aria-pressed", "true");
    await ui.close.click();
    await expect(ui.panel).toBeHidden();

    const rename = async (name: string) => {
      await chat.getByRole("button", { name: "Editar" }).first().click();
      await chat.getByLabel("Nombre").fill(name);
      await chat.getByRole("button", { name: "Guardar" }).click();
      await expect(chat.getByRole("dialog")).toBeHidden();
    };
    try {
      await rename("Ensalada verde 2");
      await openAssistant(chat);
      // The subtitle comes from the context, so the new name proves the page registered again without a route change.
      await expect(ui.panel.locator("header p")).toHaveText("Sobre Ensalada verde 2");
      await expect(optionOf(chat, "Carrito")).toHaveAttribute("aria-pressed", "true");
      await expect(optionOf(chat, "Esta receta")).toHaveAttribute("aria-pressed", "false");
      await typeQuestion(chat, QUESTION);
      await expect(ui.assistantTurns).toHaveCount(1);
      expect(mock.requests[0].scope).toBe("Carrito");
    } finally {
      if (await ui.panel.isVisible()) await ui.close.click();
      await rename("Ensalada verde");
    }
  });
});

test.describe("REQ-21: the segmented group on desktop", () => {
  test("ArrowRight and Enter select Plan activo, which is pressed and keeps focus", async ({ chat }) => {
    await chat.goto("/");
    await openAssistant(chat);
    await optionOf(chat, "Todo").focus();
    await chat.keyboard.press("ArrowRight");
    await expect(optionOf(chat, "Plan activo")).toBeFocused();
    await chat.keyboard.press("Enter");
    await expect(optionOf(chat, "Plan activo")).toHaveAttribute("aria-pressed", "true");
    await expect(optionOf(chat, "Plan activo")).toBeFocused();
    await expect(optionOf(chat, "Todo")).toHaveAttribute("aria-pressed", "false");
  });

  test("Space selects too, and only one option is pressed", async ({ chat }) => {
    await chat.goto("/");
    await openAssistant(chat);
    await optionOf(chat, "Todo").focus();
    await chat.keyboard.press("ArrowRight");
    await chat.keyboard.press("ArrowRight");
    await chat.keyboard.press("Space");
    await expect(optionOf(chat, "Recetario")).toHaveAttribute("aria-pressed", "true");
    await expect(groupOf(chat).locator("[aria-pressed=true]")).toHaveCount(1);
  });

  test("the compact button is not rendered on desktop", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await expect(groupOf(chat)).toBeVisible();
    await expect(ui.panel.getByRole("button", { name: /^Alcance:/ })).toHaveCount(0);
  });
});

test.describe("REQ-21: the button and listbox at 360 px", () => {
  test.use({ viewport: PHONE });

  const scopeButton = (page: Page, scope: string) => assistantUi(page).panel.getByRole("button", { name: `Alcance: ${scope}` });
  const listbox = (page: Page) => assistantUi(page).panel.getByRole("listbox", { name: "Alcance" });
  const optionIn = (page: Page, name: string) => listbox(page).getByRole("option", { name, exact: true });

  test("only the button shows, collapsed", async ({ chat }) => {
    await chat.goto("/");
    await openAssistant(chat);
    await expect(groupOf(chat)).toHaveCount(0);
    await expect(scopeButton(chat, "Todo")).toHaveAttribute("aria-expanded", "false");
    await expect(scopeButton(chat, "Todo")).toHaveAttribute("aria-haspopup", "listbox");
    await expect(listbox(chat)).toHaveCount(0);
  });

  test("opening focuses Todo; ArrowDown twice and Enter select Recetario, close the menu and keep focus on the button", async ({ chat }) => {
    await chat.goto("/");
    await openAssistant(chat);
    await scopeButton(chat, "Todo").click();
    await expect(scopeButton(chat, "Todo")).toHaveAttribute("aria-expanded", "true");
    await expect(optionIn(chat, "Todo")).toBeFocused();
    await expect(optionIn(chat, "Todo")).toHaveAttribute("aria-selected", "true");
    await expect(optionIn(chat, "Recetario")).toHaveAttribute("aria-selected", "false");
    await chat.keyboard.press("ArrowDown");
    await chat.keyboard.press("ArrowDown");
    await expect(optionIn(chat, "Recetario")).toBeFocused();
    await chat.keyboard.press("Enter");
    await expect(listbox(chat)).toHaveCount(0);
    await expect(scopeButton(chat, "Recetario")).toBeFocused();
    await expect(scopeButton(chat, "Recetario")).toHaveAttribute("aria-expanded", "false");
  });

  test("Space selects, and a click on an option does too", async ({ chat }) => {
    await chat.goto("/");
    await openAssistant(chat);
    await scopeButton(chat, "Todo").click();
    await chat.keyboard.press("ArrowDown");
    await chat.keyboard.press("Space");
    await expect(scopeButton(chat, "Plan activo")).toBeFocused();
    await scopeButton(chat, "Plan activo").click();
    await optionIn(chat, "Carrito").click();
    await expect(listbox(chat)).toHaveCount(0);
    await expect(scopeButton(chat, "Carrito")).toBeFocused();
  });

  test("Escape closes the menu and focuses the button while the panel stays open; a second Escape closes the panel", async ({ chat }) => {
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await scopeButton(chat, "Todo").click();
    await expect(optionIn(chat, "Todo")).toBeFocused();
    await chat.keyboard.press("Escape");
    await expect(listbox(chat)).toHaveCount(0);
    await expect(scopeButton(chat, "Todo")).toBeFocused();
    await expect(ui.panel).toBeVisible();
    await chat.keyboard.press("Escape");
    await expect(ui.panel).toBeHidden();
    await expect(ui.fab).toBeFocused();
  });

  test("the menu has Esta receta only on a recipe page, and that page starts on it", async ({ chat }) => {
    await chat.goto(`/recipes/${recipeId}`);
    await openAssistant(chat);
    await scopeButton(chat, "Esta receta").click();
    await expect(listbox(chat).getByRole("option")).toHaveText(["Todo", "Plan activo", "Recetario", "Carrito", "Esta receta"]);
    await expect(optionIn(chat, "Esta receta")).toBeFocused();
  });

  test("a click on the listbox padding or gap keeps the menu open", async ({ chat }) => {
    await chat.goto("/");
    await openAssistant(chat);
    await scopeButton(chat, "Todo").click();
    // A locator click waits for the panel's open transition to settle before it resolves the position, which a box read mid-transition would not.
    // 2 px inside the top edge is the 6 px padding, above the first option.
    const list = listbox(chat);
    const width = (await list.evaluate((node) => node.getBoundingClientRect().width));
    await list.click({ position: { x: width / 2, y: 2 } });
    await expect(listbox(chat)).toBeVisible();
    await expect(scopeButton(chat, "Todo")).toHaveAttribute("aria-expanded", "true");
  });

  test("widening past 640 px closes an open menu, so it is not open when the sheet comes back", async ({ chat }) => {
    await chat.goto("/");
    await openAssistant(chat);
    await scopeButton(chat, "Todo").click();
    await expect(listbox(chat)).toBeVisible();
    // Guards a WebKit/Safari case: Chromium blurs a focused element hidden with display:none, and the blur handler would
    // close the menu on its own. The focusout is swallowed before React sees it, so only the resize handler can close it.
    await scopeButton(chat, "Todo").focus();
    await chat.evaluate(() => document.addEventListener("focusout", (event) => event.stopImmediatePropagation(), { capture: true }));
    await expect(listbox(chat)).toBeVisible();
    await chat.setViewportSize({ width: 1024, height: 740 });
    await chat.setViewportSize(PHONE);
    await expect(listbox(chat)).toHaveCount(0);
    await expect(scopeButton(chat, "Todo")).toHaveAttribute("aria-expanded", "false");
  });

  test("a question uses the chosen scope", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer());
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await scopeButton(chat, "Todo").click();
    await optionIn(chat, "Carrito").click();
    await typeQuestion(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(1);
    expect(mock.requests.map((request) => request.scope)).toEqual(["Carrito"]);
    expect(await labelsOf(chat)).toEqual(["Carrito"]);
  });

  /** Header row 2 holds the scope button and Nueva conversación side by side, each at least 44 px, inside the sheet. */
  async function expectRowTwoFits(page: Page, scope: string) {
    const box = (locator: Locator) => locator.evaluate((node) => node.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number; right: number });
    const scopeBox = await box(scopeButton(page, scope));
    const freshBox = await box(assistantUi(page).panel.getByRole("button", { name: "Nueva conversación" }));
    const closeBox = await box(assistantUi(page).close);
    for (const [name, target] of [["scope", scopeBox], ["Nueva conversación", freshBox]] as const) {
      expect(target.height, `${name} height`).toBeGreaterThanOrEqual(44);
      expect(target.width, `${name} width`).toBeGreaterThanOrEqual(44);
      expect(target.right, `${name} inside the sheet`).toBeLessThanOrEqual(PHONE.width - 8);
    }
    expect(scopeBox.right, "scope and Nueva conversación do not overlap").toBeLessThanOrEqual(freshBox.x + 0.5);
    expect(Math.abs(scopeBox.y - freshBox.y), "same row").toBeLessThan(8);
    expect(scopeBox.y, "below row 1").toBeGreaterThanOrEqual(closeBox.y + closeBox.height - 1);
    // The label is whole: nothing is clipped by the button.
    expect(await scopeButton(page, scope).evaluate((node) => node.scrollWidth <= node.clientWidth + 1), "label not clipped").toBe(true);
  }

  test("row 2 fits the longest labels next to Nueva conversación", async ({ chat }) => {
    await mockChat(chat, cartAnswer());
    await chat.goto("/");
    await openAssistant(chat);
    await typeQuestion(chat, QUESTION);
    await expect(assistantUi(chat).assistantTurns).toHaveCount(1);
    await scopeButton(chat, "Todo").click();
    await optionIn(chat, "Plan activo").click();
    await expectRowTwoFits(chat, "Plan activo");

    await chat.goto(`/recipes/${recipeId}`);
    await openAssistant(chat);
    await typeQuestion(chat, QUESTION);
    await expect(assistantUi(chat).assistantTurns).toHaveCount(1);
    await expectRowTwoFits(chat, "Esta receta");
  });
});

test.describe("REQ-13: a search-bar question", () => {
  const bar = (page: Page) => page.getByRole("search").getByLabel("Preguntar al asistente");
  const barScope = (page: Page) => page.getByRole("search").getByRole("button", { name: /^Buscar en:/ });

  async function chooseBarScope(page: Page, scope: string) {
    await barScope(page).click();
    await page.getByRole("menuitemradio", { name: scope }).click();
  }

  test("uses the bar's scope once, focuses the panel input and leaves the switcher alone", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer());
    await chat.goto("/");
    const ui = assistantUi(chat);
    await chooseBarScope(chat, "Recetario");
    await bar(chat).fill(QUESTION);
    await bar(chat).press("Enter");
    await expect(ui.panel).toBeVisible();
    await expect(ui.input).toBeFocused();
    await expect(ui.assistantTurns).toHaveCount(1);
    expect(await labelsOf(chat)).toEqual(["Recetario"]);
    await expect(optionOf(chat, "Todo")).toHaveAttribute("aria-pressed", "true");
    expect(mock.requests.map((request) => request.scope)).toEqual(["Recetario"]);

    // The next typed question is asked in the switcher's scope again.
    await typeQuestion(chat, QUESTION);
    await expect(ui.assistantTurns).toHaveCount(2);
    expect(await labelsOf(chat)).toEqual(["Recetario", "Todo"]);
  });

  test("with the panel already open a bar question still moves focus to the panel input", async ({ chat }) => {
    await mockChat(chat, cartAnswer());
    await chat.goto("/");
    const ui = await openAssistant(chat);
    await bar(chat).fill(QUESTION);
    await bar(chat).press("Enter");
    await expect(ui.assistantTurns).toHaveCount(1);
    await expect(ui.input).toBeFocused();
  });

  test("the bar's input and scope button are disabled while a question is pending", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer(), { hold: true });
    await chat.goto("/");
    await bar(chat).fill(QUESTION);
    await bar(chat).press("Enter");
    await expect(assistantUi(chat).pending).toHaveCount(1);
    await expect(bar(chat)).toBeDisabled();
    await expect(barScope(chat)).toBeDisabled();
    mock.release();
    await expect(assistantUi(chat).assistantTurns).toHaveCount(1);
    await expect(bar(chat)).toBeEnabled();
    await expect(barScope(chat)).toBeEnabled();
  });

  test("a question over 500 characters, trimmed, sends nothing, and 500 plus padding does", async ({ chat }) => {
    const mock = await mockChat(chat, cartAnswer());
    await chat.goto("/");
    await bar(chat).fill("a".repeat(501));
    await bar(chat).press("Enter");
    await chat.waitForTimeout(400);
    expect(mock.requests).toHaveLength(0);
    await expect(assistantUi(chat).panel).toBeHidden();
    await expect(bar(chat)).toHaveValue("a".repeat(501));

    await bar(chat).fill(`  ${"a".repeat(500)}  `);
    await bar(chat).press("Enter");
    await expect(assistantUi(chat).assistantTurns).toHaveCount(1);
    expect(mock.requests).toHaveLength(1);
  });
});
