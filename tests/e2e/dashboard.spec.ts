import { expect, test as base, type Page } from "@playwright/test";
import { sql } from "./database";

// The signed-in home, end to end: real UI, real API routes, real Postgres (the e2e copy).
// Every change is checked three ways: on screen, after a reload, and in the database.

const test = base.extend<{ issues: string[] }>({
  // Any page error, console error or failed API call fails the test that caused it.
  issues: [
    async ({ page }, use) => {
      const issues: string[] = [];
      page.on("pageerror", (error) => issues.push(`page error: ${error.message}`));
      page.on("console", (message) => message.type() === "error" && issues.push(`console: ${message.text().slice(0, 200)}`));
      page.on("response", (response) => {
        if (response.url().includes("/api/") && response.status() >= 400) issues.push(`${response.request().method()} ${new URL(response.url()).pathname} → ${response.status()}`);
      });
      await use(issues);
      expect(issues, "console errors or failed API calls").toEqual([]);
    },
    { auto: true }
  ]
});

test.describe.configure({ mode: "serial" });

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const TODAY = dayKey(new Date());
const YESTERDAY = dayKey(new Date(Date.now() - 864e5));
const mealsDone = (date: string) => Number(sql(`select coalesce(array_length(meals_done, 1), 0) from daily_logs where date = '${date}'`) || 0);
const dayValue = (column: string, date = TODAY) => sql(`select ${column} from daily_logs where date = '${date}'`);

/** Clicks and waits for the matching save request to succeed. */
async function clickAndSave(page: Page, target: ReturnType<Page["locator"]>, path: string, method = "PUT") {
  await Promise.all([page.waitForResponse((r) => r.url().includes(path) && r.request().method() === method && r.status() < 400), target.click()]);
}

async function openHome(page: Page) {
  await page.goto("/");
  await expect(page.locator(".home-strip.is-ready")).toBeVisible();
}

test.beforeEach(async ({ page }) => openHome(page));

test("loads the home with every section, in one screen at 1440×900", async ({ page }) => {
  await expect(page.locator(".home-hello h1")).toHaveText("Hola, Rafael");
  for (const id of ["#day-title", "#report-title", "#shop-title", "#intake-title", "#promo-title"]) await expect(page.locator(id)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
});

test.describe("meals", () => {
  test('"Marcar como hecha" completes the next meal and opens the following one', async ({ page }) => {
    const nextTitle = page.locator(".home-timeline > li.is-next .home-meal strong");
    const title = (await nextTitle.textContent())!;
    const pending = Number(await page.locator(".home-hello p b").textContent());
    const before = mealsDone(TODAY);

    await clickAndSave(page, page.locator(".home-timeline > li.is-next .home-next .home-btn:not(.is-quiet)"), "/api/daily-logs/");
    await expect(page.locator("[data-sonner-toast]")).toContainText("marcada como hecha");
    await expect(nextTitle).not.toHaveText(title);
    await expect(page.locator(".home-hello p b")).toHaveText(String(pending - 1));
    expect(mealsDone(TODAY)).toBe(before + 1);

    const newTitle = (await nextTitle.textContent())!;
    await openHome(page);
    await expect(nextTitle).toHaveText(newTitle);
  });

  test('"Deshacer" in the toast reverts the meal', async ({ page }) => {
    const pending = Number(await page.locator(".home-hello p b").textContent());
    await page.locator(".home-timeline > li.is-next .home-next .home-btn:not(.is-quiet)").click();
    await expect(page.locator(".home-hello p b")).toHaveText(String(pending - 1));
    const afterDone = mealsDone(TODAY);

    await clickAndSave(page, page.locator("[data-sonner-toast] button[data-button]"), "/api/daily-logs/");
    expect(mealsDone(TODAY)).toBe(afterDone - 1);
    await openHome(page);
    await expect(page.locator(".home-hello p b")).toHaveText(String(pending));
  });

  test("timeline check circles toggle a meal on and off", async ({ page }) => {
    const before = mealsDone(TODAY);
    await clickAndSave(page, page.locator(".home-timeline > li:not(.is-done) .home-check").first(), "/api/daily-logs/");
    expect(mealsDone(TODAY)).toBe(before + 1);

    await openHome(page);
    await expect(page.locator('.home-timeline > li .home-check[aria-checked="true"]')).toHaveCount(before + 1);
    await clickAndSave(page, page.locator(".home-timeline > li.is-done .home-check").last(), "/api/daily-logs/");
    expect(mealsDone(TODAY)).toBe(before);
  });

  test("intake rings count the equivalents of meals marked done", async ({ page }) => {
    const total = async () => (await page.locator(".home-intake-text b").allTextContents()).reduce((sum, value) => sum + Number(value.split("/")[0]), 0);
    const before = await total();
    await clickAndSave(page, page.locator(".home-timeline > li.is-next .home-check"), "/api/daily-logs/");
    await expect.poll(total).toBeGreaterThan(before);
    await clickAndSave(page, page.locator(".home-timeline > li.is-done .home-check").last(), "/api/daily-logs/");
    await expect.poll(total).toBe(before);
  });

  test("meal times can be edited", async ({ page }) => {
    await page.getByRole("button", { name: "Editar horarios" }).click();
    const input = page.locator(".home-time-input").first();
    await input.fill("07:15");
    await Promise.all([page.waitForResponse((r) => r.url().includes("/api/meal-types/") && r.request().method() === "PATCH" && r.ok()), input.blur()]);
    await page.getByRole("button", { name: "Terminar de editar horarios" }).click();
    await openHome(page);
    await expect(page.locator(".home-timeline > li time").first()).toHaveText(/^7:15/);
  });
});

test.describe("days", () => {
  test("a past day can be logged; a future day cannot", async ({ page }) => {
    const pills = page.locator(".home-strip-days .home-daypill");
    const todayIndex = await pills.evaluateAll((elements) => elements.findIndex((element) => element.classList.contains("is-selected")));

    await pills.nth(todayIndex - 1).click();
    await expect(page.locator("#day-title")).toContainText("ayer");
    const before = mealsDone(YESTERDAY);
    const first = page.locator(".home-timeline > li .home-check").first();
    const wasDone = (await first.getAttribute("aria-checked")) === "true";
    await clickAndSave(page, first, `/api/daily-logs/${YESTERDAY}`);
    expect(mealsDone(YESTERDAY)).toBe(before + (wasDone ? -1 : 1));
    await clickAndSave(page, first, `/api/daily-logs/${YESTERDAY}`);
    expect(mealsDone(YESTERDAY)).toBe(before);

    await pills.nth(todayIndex + 1).click();
    await expect(page.locator("#day-title")).toContainText("mañana");
    for (const check of await page.locator(".home-timeline > li .home-check").all()) await expect(check).toBeDisabled();
  });

  test("the strip arrows move five days and come back", async ({ page }) => {
    const firstDay = page.locator(".home-strip-days .home-daypill b").first();
    const start = (await firstDay.textContent())!;
    await page.locator(".home-strip-days .home-chev").last().click();
    await expect(firstDay).not.toHaveText(start);
    await page.locator(".home-strip-days .home-chev").first().click();
    await expect(firstDay).toHaveText(start);
  });
});

test.describe("water", () => {
  test("tapping a cup saves that many glasses; tapping the last full one removes a glass", async ({ page }) => {
    const full = page.locator(".home-cup.is-full");
    const target = Math.min((await full.count()) + 2, 8);
    await clickAndSave(page, page.locator(".home-cup").nth(target - 1), "/api/daily-logs/");
    await expect(full).toHaveCount(target);
    expect(Number(dayValue("water_glasses"))).toBe(target);

    await openHome(page);
    await expect(full).toHaveCount(target);
    await clickAndSave(page, page.locator(".home-cup").nth(target - 1), "/api/daily-logs/");
    await expect(full).toHaveCount(target - 1);
    expect(Number(dayValue("water_glasses"))).toBe(target - 1);
  });

  test("the weekly water tile adds up the week", async ({ page }) => {
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const glasses = Number(sql(`select coalesce(sum(least(water_glasses, 8)), 0) from daily_logs where date >= '${dayKey(monday)}' and date <= '${TODAY}'`));
    const shown = Number((await page.locator(".tone-water .home-tile-value b").textContent())!.replace(/[^\d.]/g, ""));
    expect(shown).toBeCloseTo(glasses * 0.25, 2);
  });
});

test.describe("weekly report", () => {
  test('"¿Ejercicio hoy?" marks today as an exercise day', async ({ page }) => {
    const toggle = page.locator(".home-activity-toggle");
    const wasOn = (await toggle.getAttribute("aria-pressed")) === "true";
    await clickAndSave(page, toggle, "/api/daily-logs/");
    await expect(toggle).toHaveAttribute("aria-pressed", String(!wasOn));
    expect(dayValue("exercised")).toBe(wasOn ? "f" : "t");

    await openHome(page);
    await expect(toggle).toHaveAttribute("aria-pressed", String(!wasOn));
    if (!wasOn) await expect(page.locator(".home-activity-days li.is-today.is-done")).toBeVisible();
  });

  test("the weekly activity goal can be changed", async ({ page }) => {
    const goal = Number(sql("select activity_goal_days from users limit 1"));
    const step = goal < 7 ? 1 : -1;
    await page.locator(".home-tile-link").click();
    await clickAndSave(page, page.getByRole("button", { name: step > 0 ? "Más días" : "Menos días" }), "/api/goals");
    expect(Number(sql("select activity_goal_days from users limit 1"))).toBe(goal + step);

    await openHome(page);
    await expect(page.locator(".home-tile-link")).toHaveText(`Meta ${goal + step} días`);
  });

  test("weight: invalid input is rejected; a weight and goal save", async ({ page }) => {
    await page.locator(".home-tile-hit").click();
    const inputs = page.locator(".home-popover input");
    await inputs.nth(0).fill("500");
    await page.locator('.home-popover button[type="submit"]').click();
    await expect(page.locator(".home-popover-error")).toContainText("entre 20 y 400");

    await inputs.nth(0).fill("62,4");
    await inputs.nth(1).fill("57");
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/daily-logs/") && r.ok()),
      page.waitForResponse((r) => r.url().includes("/api/goals") && r.ok()),
      page.locator('.home-popover button[type="submit"]').click()
    ]);
    expect(dayValue("weight_kg")).toBe("62.4");
    expect(sql("select weight_goal_kg from users limit 1")).toBe("57");

    await openHome(page);
    await expect(page.locator(".tone-weight .home-tile-value")).toContainText("62.4 kg");
    await expect(page.locator(".tone-weight .home-tile-value")).toContainText("Meta 57 kg");
  });
});

test.describe("shopping", () => {
  test("the newest shopping list can be checked off (the cart shows until one exists)", async ({ page }) => {
    if ((await page.locator("#shop-title").textContent())?.trim() === "Carrito") {
      const status = await page.evaluate(async () => (await fetch("/api/cart/generate-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Prueba e2e", period_days: 7 }) })).status);
      expect(status).toBeLessThan(400);
      await openHome(page);
    }
    await expect(page.locator("#shop-title")).toHaveText("Lista de compras");

    const count = page.locator(".home-shop .home-count");
    const bought = Number((await count.textContent())!.split(" ")[0]);
    const unchecked = page.locator('.home-shop-list .home-box[aria-checked="false"]').first();
    test.skip((await unchecked.count()) === 0, "every item of the newest list is already bought");
    await clickAndSave(page, unchecked, "/api/shopping-lists/", "PATCH");
    await expect(count).toHaveText(new RegExp(`^${bought + 1} de`));

    await openHome(page);
    await expect(count).toHaveText(new RegExp(`^${bought + 1} de`));
  });
});

type CartData = { sources: { id: string; source_id: string }[]; ingredients: { name: string; unit: string; quantity: number; sources: { source_name: string }[] }[] };
type Usage = { name: string; unit: string; quantity: number };

const apiCall = (page: Page, method: string, url: string, body?: unknown) =>
  page.evaluate(
    async ([method, url, body]) => {
      const response = await fetch(url as string, { method: method as string, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, data: await response.json() };
    },
    [method, url, body]
  );
const readCart = async (page: Page) => (await apiCall(page, "GET", "/api/cart")).data as CartData;
/** What the cart shows for one ingredient (name and unit as consolidateCart groups them). */
const cartQuantity = (data: CartData, { name, unit }: Usage) => data.ingredients.find((ingredient) => ingredient.name === name && ingredient.unit === unit)?.quantity ?? 0;
/** Sums usages that share a name and unit, with the same quantity/unit fallbacks as consolidateCart. */
const usagesOf = (sourceType: "recipe" | "add_on", sourceIds: string[]) => {
  const rows = sql(`select i.canonical_name, coalesce(nullif(u.practical_unit, ''), u.unit, ''), coalesce(nullif(u.practical_quantity, 0), nullif(u.quantity, 0), 1)
    from ingredient_usages u join ingredients i on i.id = u.ingredient_id
    where u.source_type = '${sourceType}' and u.source_id in (${sourceIds.map((value) => `'${value}'`).join(",") || "null"}) and u.deleted_at is null`);
  const totals = new Map<string, Usage>();
  for (const row of rows ? rows.split("\n") : []) {
    const [name, unit, quantity] = row.split("|");
    const entry = totals.get(`${name}|${unit}`) ?? { name, unit, quantity: 0 };
    entry.quantity += Number(quantity);
    totals.set(`${name}|${unit}`, entry);
  }
  return Array.from(totals.values());
};
const scaled = (usages: Usage[], factor: number) => usages.map((usage) => ({ ...usage, quantity: usage.quantity * factor }));
/** Live recipes with ingredients that are not in the cart yet. */
const recipesWithIngredients = () =>
  sql(`select r.id from recipes r where r.deleted_at is null and exists (select 1 from ingredient_usages u where u.source_type = 'recipe' and u.source_id = r.id and u.deleted_at is null) order by r.seq`).split("\n").filter(Boolean);

test.describe("cart and deleted recipes", () => {
  test("a recipe in the Papelera leaves the cart, and counts again once restored", async ({ page }) => {
    const baseline = await readCart(page);
    const inCart = new Set(baseline.sources.map((source) => source.source_id));
    const recipeId = recipesWithIngredients().find((id) => !inCart.has(id));
    test.skip(!recipeId, "every recipe with ingredients is already in the cart");
    const usages = usagesOf("recipe", [recipeId!]);

    // Attributed by ingredient: each ingredient's cart quantity moves by exactly this recipe's usage, whatever else is in the cart.
    const expectDelta = (data: CartData, factor: number) => {
      for (const usage of scaled(usages, factor)) expect(cartQuantity(data, usage), `${usage.name} (${usage.unit})`).toBeCloseTo(cartQuantity(baseline, usage) + usage.quantity, 5);
    };

    const added = await apiCall(page, "POST", "/api/cart/items", { source_type: "recipe", source_id: recipeId, include_add_ons: false });
    expect(added.status).toBeLessThan(400);
    const itemId = added.data.item.id as string;
    try {
      const before = await readCart(page);
      expect(before.sources.map((source) => source.source_id)).toContain(recipeId);
      expectDelta(before, 1);

      expect((await apiCall(page, "DELETE", `/api/recipes/${recipeId}`)).status).toBeLessThan(400);
      const deleted = await readCart(page);
      expect(deleted.sources.map((source) => source.source_id)).not.toContain(recipeId);
      expectDelta(deleted, 0);

      expect((await apiCall(page, "POST", `/api/trash/recipe/${recipeId}/restore`)).status).toBeLessThan(400);
      const restored = await readCart(page);
      expect(restored.sources.map((source) => source.source_id)).toContain(recipeId);
      expectDelta(restored, 1);
    } finally {
      await apiCall(page, "POST", `/api/trash/recipe/${recipeId}/restore`);
      await apiCall(page, "DELETE", `/api/cart/items/${itemId}`);
    }
  });

  test("a meal's required add-ons count once, scaled by the largest multiplier among its options", async ({ page }) => {
    // The active plan's first meal with two options that appear in no other meal, and a required add-on with ingredients.
    const [mealId, optionA, optionB] = sql(`
      select mt.id, (array_agg(r.id order by l.seq))[1], (array_agg(r.id order by l.seq))[2]
      from plans p
      join plan_versions pv on pv.plan_id = p.id and pv.is_current and pv.deleted_at is null
      join meal_types mt on mt.plan_version_id = pv.id
      join plan_version_recipes l on l.meal_type_id = mt.id and l.plan_version_id = pv.id and l.deleted_at is null
      join recipes r on r.id = l.recipe_id and r.deleted_at is null
      where p.status = 'active' and p.deleted_at is null
        and (select count(*) from plan_version_recipes o where o.recipe_id = r.id and o.plan_version_id = pv.id and o.deleted_at is null) = 1
        and exists (select 1 from shared_add_ons a join ingredient_usages u on u.source_type = 'add_on' and u.source_id = a.id and u.deleted_at is null
                    where a.meal_type_id = mt.id and a.required is not false and a.deleted_at is null)
        -- A live add-ons item already in the active cart puts this meal's add-on in the baseline with its own multiplier.
        and not exists (select 1 from cart_items ci
                        join carts c on c.id = ci.cart_id and c.status = 'active' and c.deleted_at is null
                        join plan_version_recipes l2 on l2.recipe_id = ci.source_id and l2.meal_type_id = mt.id and l2.plan_version_id = pv.id and l2.deleted_at is null
                        where ci.source_type = 'recipe' and ci.include_add_ons and ci.deleted_at is null)
      group by mt.id, mt.seq having count(*) >= 2 order by mt.seq limit 1`).split("|");
    expect(mealId, "the clone has an active-plan meal with 2+ options and a required add-on with ingredients").toBeTruthy();

    const addOnIds = sql(`select id from shared_add_ons where meal_type_id = '${mealId}' and required is not false and deleted_at is null`).split("\n");
    const addOns = usagesOf("add_on", addOnIds);
    const addOnNames = sql(`select name from shared_add_ons where id in (${addOnIds.map((value) => `'${value}'`).join(",")})`).split("\n");
    const own = (recipeId: string, factor: number) => scaled(usagesOf("recipe", [recipeId]), factor);
    expect(addOns.length).toBeGreaterThan(0);

    const baseline = await readCart(page);
    const itemIds: string[] = [];
    const addOption = async (recipeId: string, multiplier: number, includeAddOns: boolean) => {
      const added = await apiCall(page, "POST", "/api/cart/items", { source_type: "recipe", source_id: recipeId, quantity_multiplier: multiplier, include_add_ons: includeAddOns });
      expect(added.status).toBeLessThan(400);
      itemIds.push(added.data.item.id);
      return added.data.item.id as string;
    };
    // Expected cart quantity of every add-on ingredient: baseline + the recipes' own usages + the add-ons, however many options were added.
    const expectAddOns = (data: CartData, addOnFactor: number, recipes: [string, number][]) => {
      for (const addOn of scaled(addOns, addOnFactor)) {
        const fromRecipes = recipes.flatMap(([recipeId, factor]) => own(recipeId, factor)).filter((usage) => usage.name === addOn.name && usage.unit === addOn.unit).reduce((sum, usage) => sum + usage.quantity, 0);
        expect(cartQuantity(data, addOn), `${addOn.name} (${addOn.unit})`).toBeCloseTo(cartQuantity(baseline, addOn) + fromRecipes + addOn.quantity, 5);
      }
    };

    const reset = async () => {
      // An id leaves the list only once its DELETE succeeded, so the finally block still cleans up after a failure.
      for (const itemId of [...itemIds]) {
        expect((await apiCall(page, "DELETE", `/api/cart/items/${itemId}`)).status).toBeLessThan(400);
        itemIds.splice(itemIds.indexOf(itemId), 1);
      }
    };

    try {
      // Options are alternatives: the add-on follows the largest multiplier, not the sum (4 + 3).
      await addOption(optionA, 4, true);
      await addOption(optionB, 3, true);
      const both = await readCart(page);
      expectAddOns(both, 4, [[optionA, 4], [optionB, 3]]);
      // Add-ons are attributed by name in each ingredient's sources, and are not cart items themselves.
      for (const addOn of addOns) {
        const sourceNames = both.ingredients.find((ingredient) => ingredient.name === addOn.name && ingredient.unit === addOn.unit)?.sources.map((source) => source.source_name) ?? [];
        expect(addOnNames.filter((name) => sourceNames.includes(name)), `${addOn.name} has an add-on source`).not.toHaveLength(0);
      }
      expect(both.sources.map((source) => source.source_id).filter((sourceId) => addOnIds.includes(sourceId))).toEqual([]);
      await reset();

      // Two options at the default multiplier still need the add-on once.
      await addOption(optionA, 1, true);
      await addOption(optionB, 1, true);
      expectAddOns(await readCart(page), 1, [[optionA, 1], [optionB, 1]]);
      await reset();

      // An option without add-ons contributes none: the add-on follows the remaining option.
      await addOption(optionA, 4, false);
      await addOption(optionB, 3, true);
      expectAddOns(await readCart(page), 3, [[optionA, 4], [optionB, 3]]);
    } finally {
      for (const itemId of itemIds) await apiCall(page, "DELETE", `/api/cart/items/${itemId}`);
    }
  });
});

test.describe("assistant and upload", () => {
  test("the search sends the question to the assistant, which answers", async ({ page }) => {
    const search = page.locator(".home-search input");
    await search.fill("¿Qué ingredientes necesito comprar?");
    await search.press("Enter");
    await expect(search).toHaveValue("");
    await expect(page.locator(".assistant-bubble.user")).toContainText("¿Qué ingredientes necesito comprar?");
    const answer = page.locator(".assistant-bubble.assistant:not(.typing)").last();
    await expect(answer).toBeVisible({ timeout: 20_000 });
    await expect(answer).not.toContainText("No pude responder");
  });

  test('the plan banner\'s "Subir plan" opens the upload wizard', async ({ page }) => {
    await page.locator(".home-promo-btn").click();
    await expect(page.locator(".upload-wizard-modal")).toBeVisible();
  });
});
