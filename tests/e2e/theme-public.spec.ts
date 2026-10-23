import type { Page } from "@playwright/test";
import { expect, expectIssues, test, watch } from "./fixtures";
import { expectThemeMeta, lightLockedPages, seedTheme, softNavMarker, THEME_KEY, type Theme } from "./theme-helpers";

// US4 (REQ-14): the landing, the legal pages and the root not-found page always render light, and the theme comes
// back when the user moves into the app (soft navigation included). The app starts in the light OS scheme.

const LOCK = "[data-theme-lock]";
const NOT_FOUND = [/Failed to load resource.*404/]; // an unmatched URL answers 404, which the browser logs as a console error
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), THEME_KEY);
const colorScheme = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
const appIs = async (page: Page, theme: Theme) => {
  await expect(page.locator(".topbar .theme-toggle")).toBeVisible();
  await expectThemeMeta(page, theme);
};

test.describe("light-locked pages, signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const [label, seed, os] of [["a stored dark choice", "dark", "light"], ["no choice and a dark OS", null, "dark"]] as const) {
    for (const { name, path } of lightLockedPages) {
      test.describe(`${name} with ${label}`, () => {
        test.use({ expectedIssues: expectIssues(...(path === "/no-existe" ? NOT_FOUND : [])) });

        test("renders light, locked, and leaves storage alone", async ({ page }) => {
          await page.emulateMedia({ colorScheme: os });
          await seedTheme(page, seed);
          await page.goto(path);
          await page.waitForLoadState("networkidle");

          expect(await colorScheme(page)).toBe("light");
          await expectThemeMeta(page, "light");
          await expect(page.locator(LOCK)).toHaveCount(1);
          expect(await stored(page)).toBe(seed);
          // The pixels of these pages are asserted in a-theme-visual.spec.ts (same baselines, three scenarios).
        });
      });
    }
  }
});

test.describe("moving between the app and locked pages without a reload", () => {
  test.beforeEach(async ({ page }) => {
    await seedTheme(page, "dark");
  });

  test("landing → app is dark, and back to the landing is light", async ({ page }) => {
    await page.goto("/inicio");
    await expect(page.locator(LOCK)).toHaveCount(1);
    await expectThemeMeta(page, "light");
    const marker = await softNavMarker(page);

    await page.locator(".lp-brand").first().click();
    await page.waitForURL("**/");
    await appIs(page, "dark");
    await marker.expectSoft();
    expect(await stored(page)).toBe("dark");

    await page.goBack();
    await page.waitForURL("**/inicio");
    await expect(page.locator(LOCK)).toHaveCount(1);
    await expectThemeMeta(page, "light");
    await marker.expectSoft();
    expect(await stored(page)).toBe("dark");
  });

  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("landing → login is dark, and the back link returns to a light landing", async ({ page }) => {
      await page.goto("/inicio");
      await expectThemeMeta(page, "light");
      const marker = await softNavMarker(page);

      await page.locator(".lp-island").getByRole("link", { name: "Entrar" }).click();
      await page.waitForURL("**/login");
      await expect(page.locator(LOCK)).toHaveCount(0);
      await expectThemeMeta(page, "dark");
      await marker.expectSoft();

      await page.locator(".login-back").click();
      await page.waitForURL("**/inicio");
      await expect(page.locator(LOCK)).toHaveCount(1);
      await expectThemeMeta(page, "light");
      await marker.expectSoft();
    });
  });

  test("the lock appears at the same pathname: the home link after the session is gone", async ({ browser, baseURL, issues }) => {
    // A fresh signed-in context: clearing cookies must never touch the shared session.
    const context = await browser.newContext({ baseURL, locale: "es-MX", storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    watch(page, issues);
    try {
      await seedTheme(page, "dark");
      await page.goto("/login");
      await page.locator(".login-submit").click();
      await page.waitForURL("/");
      await appIs(page, "dark");

      await context.clearCookies();
      await page.locator(".topbar .pill", { hasText: "Hoy" }).click();
      // The same-URL click may be served from the router cache; the documented fallback is a fresh URL.
      if (!(await page.locator(LOCK).count())) await page.evaluate(() => (window.location.href = `/?_=${Date.now()}`));
      await expect(page.locator(LOCK)).toHaveCount(1);
      expect(new URL(page.url()).pathname).toBe("/");
      await expectThemeMeta(page, "light");
    } finally {
      await context.close();
    }
  });

  test("a lock element added to and removed from a dark app page flips the theme with no navigation", async ({ page }) => {
    await page.goto("/");
    await appIs(page, "dark");
    const marker = await softNavMarker(page);

    await page.evaluate(() => {
      const lock = document.createElement("div");
      lock.id = "test-lock";
      lock.setAttribute("data-theme-lock", "light");
      document.body.append(lock);
    });
    await expectThemeMeta(page, "light");

    await page.evaluate(() => document.getElementById("test-lock")!.remove());
    await expectThemeMeta(page, "dark");
    await marker.expectSoft();
    expect(await stored(page)).toBe("dark");
  });

  test.describe("not found", () => {
    test.use({ expectedIssues: expectIssues(...NOT_FOUND) });

    test("'Volver al inicio' from the light-locked 404 lands in the dark app", async ({ page }) => {
      await page.goto("/no-existe");
      await expect(page.locator(LOCK)).toHaveCount(1);
      await expectThemeMeta(page, "light");
      const marker = await softNavMarker(page);

      await page.getByRole("link", { name: "Volver al inicio" }).click();
      await page.waitForURL("**/");
      await appIs(page, "dark");
      await marker.expectSoft();
      expect(await stored(page)).toBe("dark");
    });
  });
});
