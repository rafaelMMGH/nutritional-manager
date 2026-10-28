import { randomUUID } from "node:crypto";
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import type { ChatAnswer, Rich, ScopeKey, Section } from "../../src/lib/assistant";
import { sql } from "./database";
import { expect, test as base, watch } from "./fixtures";
import { installToolkit } from "./theme-audit";
import { contrast, effectiveBackground, toRgb, type Theme } from "./theme-helpers";

export { expect } from "./fixtures";

// Shared by the assistant specs (assistant-*.spec.ts). Every spec file runs as its own user (plan D2), so a spec can
// seed recipes, a cart and a plan without touching the main user's data or the other specs.

// ---------------------------------------------------------------------------------------------------------------------
// Chat user

type ChatUser = { id: string; email: string; token: string };
let chatUser: ChatUser | null = null;

const lit = (value: string) => `'${value.replace(/'/g, "''")}'`;
const json = (value: unknown) => `${lit(JSON.stringify(value))}::json`;
const slug = (value: string) => value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function currentUser(): ChatUser {
  if (!chatUser) throw new Error("createChatUser() must run in beforeAll before the assistant helpers are used");
  return chatUser;
}

/** The id of the current chat user (set by `createChatUser`). */
export function chatUserId(): string {
  return currentUser().id;
}

/**
 * Inserts the spec file's user and a session. `name` makes the email unique per file (asistente-e2e-<name>@local), so a
 * run that crashed before `deleteChatUser` cannot collide with the next one: leftovers are removed first.
 * Login picks the lowest `seq`, so this user never replaces the main one.
 */
export function createChatUser(name: string): ChatUser {
  const key = slug(name);
  const user = { id: `chat-e2e-${key}`, email: `asistente-e2e-${key}@local`, token: randomUUID() };
  chatUser = user;
  removeUserRows(user.id);
  sql(
    `insert into users (id, email, name, created_at, updated_at) values (${lit(user.id)}, ${lit(user.email)}, ${lit(`Asistente ${key}`)}, now(), now());` +
      `insert into sessions (token, user_id) values (${lit(user.token)}, ${lit(user.id)});` +
      // The app's first-user seed creates an empty active cart; the chat code expects one to exist.
      `insert into carts (id, user_id, status, created_at, updated_at) values (${lit(`${user.id}-cart`)}, ${lit(user.id)}, 'active', now(), now())`
  );
  return user;
}

/** Deletes the user and everything seeded or created for it. Call it in `afterAll`: a live extra user row can be read as the main one (plan D2). */
export function deleteChatUser() {
  if (!chatUser) return;
  removeUserRows(chatUser.id);
  chatUser = null;
}

// Children before parents. Every statement is scoped to the user through its owning parent.
// Shopping lists point at plan versions and carts, so they go first.
function planRowDeletes(u: string) {
  const plans = `(select id from plans where user_id = ${u})`;
  const versions = `(select id from plan_versions where plan_id in ${plans})`;
  const lists = `(select id from shopping_lists where user_id = ${u})`;
  return [
    `delete from shopping_list_items where shopping_list_id in ${lists}`,
    `delete from shopping_lists where user_id = ${u}`,
    `delete from shared_add_ons where plan_version_id in ${versions}`,
    `delete from plan_version_recipes where plan_version_id in ${versions}`,
    `delete from meal_options where plan_version_id in ${versions}`,
    `delete from meal_types where plan_version_id in ${versions}`,
    `delete from uploaded_pdfs where plan_id in ${plans}`,
    `delete from plan_versions where plan_id in ${plans}`,
    `delete from plans where user_id = ${u}`
  ];
}

function recipeRowDeletes(u: string) {
  const recipes = `(select id from recipes where user_id = ${u})`;
  const ingredients = `(select id from ingredients where user_id = ${u})`;
  return [
    `delete from ingredient_usages where source_id in ${recipes} or ingredient_id in ${ingredients}`,
    `delete from recipes where user_id = ${u}`,
    `delete from ingredients where user_id = ${u}`
  ];
}

function removeUserRows(userId: string) {
  const u = lit(userId);
  const carts = `(select id from carts where user_id = ${u})`;
  sql(
    [
      ...planRowDeletes(u),
      `delete from shopping_templates where user_id = ${u}`,
      `delete from cart_items where cart_id in ${carts}`,
      `delete from carts where user_id = ${u}`,
      ...recipeRowDeletes(u),
      `delete from daily_logs where user_id = ${u}`,
      `delete from audit_events where user_id = ${u}`,
      `delete from rag_indexes where user_id = ${u}`,
      `delete from sessions where user_id = ${u}`,
      `delete from users where id = ${u}`
    ].join(";")
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Seeders. Each one replaces what it seeded before (seedRecipes: all of the user's recipes), so a describe block can reseed between tests.

export type SeedRecipe = {
  name: string;
  /** Preparation text; empty by default. */
  description?: string;
  /** `category: "Proteínas"` makes the recipe have a protein (the recipe page then offers "¿Cuánto <proteína> lleva?"). */
  ingredients: { name: string; quantity?: number; unit?: string; category?: string }[];
};

/** Inserts the recipes with their ingredients and usages. Returns each recipe's id by name. */
export function seedRecipes(recipes: SeedRecipe[]): Record<string, string> {
  const userId = currentUser().id;
  const ids: Record<string, string> = {};
  // Reseeding starts clean, so a recipe or ingredient (and its category) from an earlier call cannot linger.
  const statements: string[] = recipeRowDeletes(lit(userId));
  for (const recipe of recipes) {
    const recipeId = `${userId}-rec-${slug(recipe.name)}`;
    ids[recipe.name] = recipeId;
    statements.push(
      `insert into recipes (id, user_id, name, description, canonical_hash, created_at, updated_at) values (${lit(recipeId)}, ${lit(userId)}, ${lit(recipe.name)}, ${lit(recipe.description ?? "")}, ${lit(slug(recipe.name))}, now(), now())`
    );
    recipe.ingredients.forEach((ingredient, index) => {
      const ingredientId = `${userId}-ing-${slug(ingredient.name)}`;
      const unit = ingredient.unit ?? "g";
      statements.push(
        `insert into ingredients (id, user_id, canonical_name, category, primary_unit, created_at, updated_at) values (${lit(ingredientId)}, ${lit(userId)}, ${lit(ingredient.name)}, ${lit(ingredient.category ?? "Otros")}, ${lit(unit)}, now(), now()) on conflict (id) do update set category = excluded.category`,
        `insert into ingredient_usages (id, ingredient_id, source_type, source_id, quantity, unit, notes, is_optional, confidence_score, requires_review, created_at) values (${lit(`${recipeId}-use-${index}`)}, ${lit(ingredientId)}, 'recipe', ${lit(recipeId)}, ${ingredient.quantity ?? 100}, ${lit(unit)}, '', false, 1, false, now())`
      );
    });
  }
  sql(statements.join(";"));
  return ids;
}

/** Soft-deletes a recipe, the way the app does (it moves to the Papelera). */
export function softDeleteRecipe(recipeId: string) {
  sql(`update recipes set deleted_at = now() where id = ${lit(recipeId)} and user_id = ${lit(currentUser().id)}`);
}

/** Replaces the active cart with `count` manual items "Ingrediente 01", "Ingrediente 02"… (quantity = position, unit g). Zero leaves an empty cart. */
export function seedCart(count: number) {
  const userId = currentUser().id;
  const cartId = `${userId}-cart`;
  const statements = [
    `delete from cart_items where cart_id = ${lit(cartId)}`,
    `delete from carts where id = ${lit(cartId)}`,
    `insert into carts (id, user_id, status, created_at, updated_at) values (${lit(cartId)}, ${lit(userId)}, 'active', now(), now())`
  ];
  for (let position = 1; position <= count; position++) {
    const name = `Ingrediente ${String(position).padStart(2, "0")}`;
    statements.push(
      `insert into cart_items (id, cart_id, source_type, quantity_multiplier, period_days, training_days, selected_alternatives, include_add_ons, include_supplements, manual_name, manual_quantity, manual_unit, created_at, updated_at) values (${lit(`${cartId}-item-${position}`)}, ${lit(cartId)}, 'manual', 1, 1, 0, '{}'::json, false, false, ${lit(name)}, ${position}, 'g', now(), now())`
    );
  }
  sql(statements.join(";"));
}

export type SeedPlan = {
  /** `all`: every meal has a time window; `some`: only the first and third; `none`: no meal has one. */
  times: "all" | "some" | "none";
  meals?: string[];
  supplements?: boolean;
  objective?: string;
  recommendations?: string;
};

export const PLAN_NAME = "Plan e2e del asistente";
const DEFAULT_MEALS = ["Desayuno", "Colación", "Comida", "Cena"];
const TIME_WINDOWS = ["Entre 7 a 8 am", "Entre 10 a 11 am", "Entre 2 a 3 pm", "Entre 8 a 9 pm"];

/** Replaces the active plan: plan, current version (`structured_data`) and one meal type per meal. */
export function seedPlan({ times, meals = DEFAULT_MEALS, supplements = true, objective = "Mejorar mi energía", recommendations = "Tomar agua durante el día" }: SeedPlan) {
  clearPlan();
  const userId = currentUser().id;
  const planId = `${userId}-plan`;
  const versionId = `${planId}-v1`;
  const windows = meals.map((_, index) => (times === "all" || (times === "some" && index % 2 === 0) ? TIME_WINDOWS[index % TIME_WINDOWS.length] : ""));
  const structured = {
    name: PLAN_NAME,
    objective,
    diagnosis: "",
    recommendations,
    supplements: supplements ? [{ name: "Vitamina D", quantity: 1, unit: "cápsula" }] : [],
    nutrition_summary: {},
    meals: meals.map((name, index) => ({ name, time_window: windows[index], options: [] }))
  };
  const statements = [
    `insert into plans (id, user_id, name, objective, status, processing_status, created_at, updated_at) values (${lit(planId)}, ${lit(userId)}, ${lit(PLAN_NAME)}, ${lit(objective)}, 'active', 'ready', now(), now())`,
    `insert into plan_versions (id, plan_id, version_number, structured_data, change_summary, is_current, created_at, updated_at) values (${lit(versionId)}, ${lit(planId)}, 1, ${json(structured)}, '', true, now(), now())`,
    ...meals.map(
      (name, index) =>
        `insert into meal_types (id, plan_version_id, name, display_order, time_window, created_at) values (${lit(`${versionId}-meal-${index}`)}, ${lit(versionId)}, ${lit(name)}, ${index}, ${lit(windows[index])}, now())`
    )
  ];
  sql(statements.join(";"));
}

/** Removes the plan and everything hanging off it, for the "no active plan" cases. */
export function clearPlan() {
  sql(planRowDeletes(lit(currentUser().id)).join(";"));
}

// ---------------------------------------------------------------------------------------------------------------------
// API

export type AskResult = { status: number; body: ChatAnswer };

/** POSTs a question to the chat API as the page's user. `request` is `page.request`. The body is a `ChatAnswer` on 200 and the error JSON otherwise. */
export async function ask(request: APIRequestContext, message: string, scope?: ScopeKey | "Carrito actual", recipeId?: string): Promise<AskResult> {
  const response = await request.post("/api/rag/chat", { data: { message, ...(scope ? { scope } : {}), ...(recipeId ? { recipe_id: recipeId } : {}) } });
  return { status: response.status(), body: (await response.json()) as ChatAnswer };
}

// ---------------------------------------------------------------------------------------------------------------------
// Fixture: a page signed in as the chat user

export const test = base.extend<{ chat: Page; chatContext: BrowserContext }>({
  // Same options as the project's pages (viewport, color scheme, reduced motion) so `test.use` applies unchanged.
  chatContext: async ({ browser, baseURL, viewport, colorScheme, reducedMotion, hasTouch, isMobile, forcedColors, issues }, use) => {
    const user = currentUser();
    const context = await browser.newContext({ baseURL, viewport, colorScheme, reducedMotion, hasTouch, isMobile, forcedColors, locale: "es-MX" });
    // Registered before the first page exists, so every page of the context reports into `issues`.
    context.on("page", (page) => watch(page, issues));
    await context.addCookies([{ name: "nm_session", value: user.token, url: baseURL ?? "http://localhost:3200", httpOnly: true, sameSite: "Lax" }]);
    await use(context);
    await context.close();
  },
  chat: async ({ chatContext }, use) => use(await chatContext.newPage())
});

/** Locators of the panel, following the plan's DOM contract. */
export function assistantUi(page: Page) {
  const panel = page.locator("#assistant-chat-panel");
  return {
    fab: page.locator(".assistant-fab"),
    panel,
    close: page.locator(".assistant-chat-close"),
    input: panel.getByLabel("Pregunta", { exact: true }),
    send: panel.getByRole("button", { name: "Enviar" }),
    log: page.locator(".assistant-chat-log"),
    userTurns: page.locator(".assistant-turn.user"),
    /** Finished assistant turns (answers and errors), not the pending one. */
    assistantTurns: page.locator(".assistant-turn.assistant:not(.is-pending)"),
    pending: page.locator(".assistant-turn.assistant.is-pending"),
    labels: page.locator(".assistant-turn-label"),
    live: page.locator(".assistant-turn-live"),
    chips: page.locator(".assistant-chips button"),
    backdrop: page.locator(".assistant-chat-backdrop")
  };
}

/** Opens the panel on the current page. */
export async function openAssistant(page: Page) {
  const ui = assistantUi(page);
  await ui.fab.click();
  await ui.panel.waitFor({ state: "visible" });
  return ui;
}

// ---------------------------------------------------------------------------------------------------------------------
// Mocked responses

const plain = (rich: Rich) => rich.map((span) => span.text).join("");

/** A contract-valid answer: `answer` is derived from the lead, body and sections the way the server builds it. */
export function buildAnswer(parts: { kind?: ChatAnswer["kind"]; lead: Rich; body?: string | null; sections?: Section[]; sources?: string[]; follow_ups?: ChatAnswer["follow_ups"]; context_used?: string }): ChatAnswer {
  const { kind = "answer", lead, body = null, sections = [], sources = [], follow_ups = [], context_used = "Todo el sistema" } = parts;
  const lines = [plain(lead), ...(body ? [body] : []), ...sections.flatMap((section) => [section.title, ...section.items.map(plain)])];
  return { answer: lines.join("\n"), context_used, sources, kind, lead, body, sections, follow_ups };
}

export const UNKNOWN_LEAD = "No encontré eso en tu información.";
export const CAPABILITY_LINE = "Puedo ayudarte con tu plan de comidas y horarios, tus recetas e ingredientes, y tu lista de compras.";

export const UNKNOWN_ANSWER = buildAnswer({ kind: "unknown", lead: [{ text: UNKNOWN_LEAD }], body: CAPABILITY_LINE });

/** A cart answer with `count` items, quantities highlighted, capped like the server does (8 items plus "y <n> más"). */
export function cartAnswer(count = 3): ChatAnswer {
  const follow_ups: ChatAnswer["follow_ups"] = [
    { text: "¿Qué recetas hay en mi plan?", scope: "Recetario" },
    { text: "¿A qué hora es mi comida?", scope: "Plan activo" }
  ];
  if (count === 0) return buildAnswer({ lead: [{ text: "Tu carrito está vacío." }], follow_ups });
  const shown = Math.min(count, 8);
  const items: Rich[] = Array.from({ length: shown }, (_, index) => [{ text: `Ingrediente ${String(index + 1).padStart(2, "0")} · ` }, { text: `${index + 1} g`, highlight: true }]);
  if (count > 8) items.push([{ text: `y ${count - 8} más` }]);
  return buildAnswer({
    lead: [{ text: "Esto es lo que tienes en tu carrito." }],
    sections: [{ title: "Ingredientes", items }],
    sources: ["Carrito actual"],
    follow_ups
  });
}

export type MockOptions = {
  /** Wait this long before answering. */
  delayMs?: number;
  /** Hold every request until `release()` is called. */
  hold?: boolean;
  /** An HTTP status of 400 or more answers with an error body instead of `answer`. */
  status?: number;
  /** Fail the request at the network level. */
  abort?: boolean;
};

export type ChatMock = {
  /** Bodies of the requests that reached the route, in order. */
  requests: { message: string; scope?: string; recipe_id?: string }[];
  /** Answers every held request. */
  release: () => void;
};

/**
 * Intercepts POST /api/rag/chat. `answer` may be a function of the request body. A mocked failure is still an issue for
 * the zero-undeclared-issues check, so the test must declare it with `expectIssues`.
 */
export async function mockChat(page: Page, answer: ChatAnswer | ((body: { message: string; scope?: string; recipe_id?: string }) => ChatAnswer), options: MockOptions = {}): Promise<ChatMock> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const mock: ChatMock = { requests: [], release };
  await page.route(/\/api\/rag\/chat$/, async (route) => {
    const body = route.request().postDataJSON() as { message: string; scope?: string; recipe_id?: string };
    mock.requests.push(body);
    if (options.hold) await released;
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    if (options.abort) return route.abort("failed");
    if (options.status && options.status >= 400) return route.fulfill({ status: options.status, contentType: "application/json", body: JSON.stringify({ error: "Respuesta simulada con error" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(typeof answer === "function" ? answer(body) : answer) });
  });
  return mock;
}

// ---------------------------------------------------------------------------------------------------------------------
// Focus rings

/**
 * Tabs through the panel's controls and reports every one whose focus indicator is below 3:1. The field draws its
 * ring as the pill's border (the field itself has no outline), so it is measured on that border.
 */
export async function focusWalk(page: Page, theme: Theme) {
  await page.evaluate(installToolkit);
  await page.keyboard.press("Shift");
  await page.locator("#assistant-chat-panel header button").first().focus();
  const failures: string[] = [];
  let stops = 0;
  for (let presses = 0; presses < 25; presses++) {
    const inside = await page.evaluate(() => Boolean(document.activeElement?.closest(".assistant-chat")));
    if (!inside) break;
    stops++;
    if (await page.evaluate(() => document.activeElement instanceof HTMLTextAreaElement)) {
      const form = page.locator(".assistant-chat-form");
      const border = await toRgb(page, await form.evaluate((node) => getComputedStyle(node).borderTopColor));
      const ratio = contrast(border, await effectiveBackground(page.locator(".assistant-composer")));
      if (ratio < 3) failures.push(`${theme} field ring ${ratio.toFixed(2)}:1`);
    } else {
      const result = await page.evaluate(() => window.__audit.focus());
      if (!result.ok) failures.push(`${theme} ${result.where} ${result.ratio.toFixed(2)}:1`);
    }
    await page.keyboard.press("Tab");
  }
  expect(stops).toBeGreaterThanOrEqual(4);
  return failures;
}
