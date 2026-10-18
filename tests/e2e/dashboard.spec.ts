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
