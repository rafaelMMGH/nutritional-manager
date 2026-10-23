import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { effectiveBackground, expectThemeMeta, oklch, seedTheme, softNavMarker, toRgb, type Rgba } from "./theme-helpers";
import { auditNow, report, visit } from "./theme-audit";

// US5 (REQ-15): /login follows the theme. It reuses the landing's chrome (.lp-island, .lp-skip, .lp-btn, .lp-footer)
// but, unlike the landing, carries no light lock and no switch. The app starts in the light OS scheme.

test.use({ storageState: { cookies: [], origins: [] } });

const LOCK = "[data-theme-lock]";

/** What one element looks like in one state: effective background, text color, and a signature of its edges. */
type Look = { bg: Rgba; color: Rgba; edges: string };

async function lookOf(page: Page, target: Locator): Promise<Look> {
  const edges = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    const outline = style.outlineStyle === "none" ? "none" : style.outlineColor;
    return [style.borderTopColor, style.boxShadow, outline].join("|");
  });
  const color = await target.evaluate((element) => getComputedStyle(element).color);
  return { bg: await effectiveBackground(target), color: await toRgb(page, color), edges };
}

const sameRgb = (a: Rgba, b: Rgba) => a.slice(0, 3).map(Math.round).join() === b.slice(0, 3).map(Math.round).join();

/** Every landing-styled part and the card, in default, hover and focus-visible; then the error states. */
async function collectLooks(page: Page) {
  const looks = new Map<string, Look>();
  const parts: Record<string, Locator> = {
    "lp-island": page.locator(".lp-island"),
    "lp-brand": page.locator(".lp-island .lp-brand"),
    "lp-mark": page.locator(".lp-island .lp-mark"),
    "login-back": page.locator(".login-back"),
    "login-submit": page.locator(".lp-btn.login-submit"),
    "lp-footer link": page.locator(".lp-footer ul a").first(),
    "lp-footer note": page.locator(".lp-footer p").first(),
    "login-card": page.locator(".login-card"),
    "email field": page.locator("#login-email"),
    "name field": page.locator("#login-name"),
    "login-head text": page.locator(".login-head p")
  };
  const interactive = ["lp-brand", "login-back", "login-submit", "lp-footer link", "email field", "name field"];

  for (const [name, target] of Object.entries(parts)) looks.set(`${name} default`, await lookOf(page, target));

  for (const name of interactive) {
    await parts[name]!.hover();
    looks.set(`${name} hover`, await lookOf(page, parts[name]!));
    await page.mouse.move(0, 0);
  }

  // The skip link is the first tab stop and only on screen while focused, so it has no hover state.
  const skip = page.locator(".lp-skip");
  looks.set("lp-skip default", await lookOf(page, skip));
  await page.keyboard.press("Tab");
  expect(await skip.evaluate((element) => element.matches(":focus-visible")), "skip link focus-visible").toBe(true);
  looks.set("lp-skip focus", await lookOf(page, skip));
  for (const name of interactive) {
    await page.keyboard.press("Tab");
    await parts[name]!.focus();
    expect(await parts[name]!.evaluate((element) => element.matches(":focus-visible")), `${name} focus-visible`).toBe(true);
    looks.set(`${name} focus`, await lookOf(page, parts[name]!));
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await triggerErrors(page);
  const errorParts: Record<string, Locator> = {
    "login-error": page.locator(".login-error"),
    "login-field-error": page.locator(".login-field-error"),
    "has-error field": page.locator(".login-field.has-error input")
  };
  for (const [name, target] of Object.entries(errorParts)) looks.set(`${name} default`, await lookOf(page, target));
  await errorParts["has-error field"]!.hover();
  looks.set("has-error field hover", await lookOf(page, errorParts["has-error field"]!));
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await errorParts["has-error field"]!.focus();
  looks.set("has-error field focus", await lookOf(page, errorParts["has-error field"]!));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  return looks;
}

/** An invalid email and an empty name: both error messages show, and the form is rejected before any API call. */
async function triggerErrors(page: Page) {
  await page.locator("#login-email").fill("sin-arroba");
  await page.locator("#login-name").fill("");
  await page.locator(".login-submit").click();
  await expect(page.locator(".login-error")).toBeVisible();
  await expect(page.locator(".login-field-error")).toBeVisible();
}

test.describe("REQ-15: /login follows the stored theme", () => {
  test("a stored dark choice renders dark from the first document, with no switch and no lock", async ({ page }) => {
    await seedTheme(page, "dark");
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __schemes: string[] }).__schemes = seen;
      const read = () => getComputedStyle(document.documentElement).colorScheme;
      const body = new MutationObserver(() => {
        if (!document.body) return;
        seen.push(read());
        body.disconnect();
        new MutationObserver(() => seen.at(-1) !== read() && seen.push(read())).observe(document.documentElement, { attributes: true });
      });
      body.observe(document, { childList: true, subtree: true });
    });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const seen = await page.evaluate(() => (window as unknown as { __schemes: string[] }).__schemes);
    expect(seen[0], "color-scheme at <body> insertion").toBe("dark");
    expect(new Set(seen), "no change through hydration").toEqual(new Set(["dark"]));
    await expectThemeMeta(page, "dark");
    await expect(page.locator(LOCK)).toHaveCount(0);
    await expect(page.locator(".theme-toggle")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Cambiar a tema/ })).toHaveCount(0);
  });

  test("with nothing stored it follows a dark OS", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await seedTheme(page, null);
    await page.goto("/login");
    await expectThemeMeta(page, "dark");
    await expect(page.locator(LOCK)).toHaveCount(0);
  });

  test("the landing-styled parts and the card all change with the theme (REQ-6, REQ-10)", async ({ page }) => {
    await visit(page, "/login", "light");
    const light = await collectLooks(page);
    await visit(page, "/login", "dark");
    const dark = await collectLooks(page);

    const problems: string[] = [];
    for (const [key, before] of light) {
      const after = dark.get(key)!;
      // Brand fills (the mark and the primary button) keep their background and text by design; judge the rest per facet.
      const brand = key.startsWith("lp-mark") || key.startsWith("login-submit");
      if (!brand && sameRgb(before.bg, after.bg) && oklch(before.bg).L > 0.8) problems.push(`background unchanged: ${key}`);
      if (!brand && sameRgb(before.color, after.color) && oklch(before.color).L < 0.35) problems.push(`text color unchanged: ${key}`);
      if (!brand && before.edges !== "none" && before.edges === after.edges && key.includes("focus")) problems.push(`edges unchanged: ${key}`);
      if (oklch(before.bg).L > 0.8 && oklch(after.bg).L > 0.5) problems.push(`surface still light in dark: ${key}`);
      if (oklch(before.color).L < 0.35 && oklch(after.color).L < 0.6) problems.push(`dark text unchanged in dark: ${key}`);
      if (before.edges !== "none" && key.includes("focus") && before.edges === after.edges) problems.push(`focus edge unchanged: ${key}`);
    }
    expect(problems).toEqual([]);
  });

  test("the decorative floaters keep their light drop-shadow in dark (REQ-6 image rule)", async ({ page }) => {
    const filters = async (theme: "light" | "dark") => {
      await visit(page, "/login", theme);
      return page.locator(".login-floater img").evaluateAll((images) => images.map((image) => getComputedStyle(image).filter));
    };
    const light = await filters("light");
    const dark = await filters("dark");
    expect(light.length).toBeGreaterThan(0);
    expect(dark).toEqual(light);
    for (const filter of dark) expect(filter).not.toMatch(/invert|brightness|grayscale|hue-rotate/);
  });

  for (const [state, prepare] of [
    ["at rest", async () => {}],
    ["with the error states showing", triggerErrors]
  ] as const) {
    test(`every text, icon, boundary and focus indicator meets AA in dark, ${state} (REQ-7)`, async ({ page }) => {
      await visit(page, "/login", "dark");
      await prepare(page);
      const result = await auditNow(page, { scope: ".login-page" });
      report(`login ${state}`, result.min, result);
      expect(result.violations).toEqual([]);
    });
  }
});

test.describe("moving into and out of /login without a reload", () => {
  test.beforeEach(async ({ page }) => {
    await seedTheme(page, "dark");
  });

  test("landing → Entrar → login is dark", async ({ page }) => {
    await page.goto("/inicio");
    await expectThemeMeta(page, "light");
    const marker = await softNavMarker(page);
    await page.locator(".lp-island").getByRole("link", { name: "Entrar" }).click();
    await page.waitForURL("**/login");
    await expect(page.locator(LOCK)).toHaveCount(0);
    await expectThemeMeta(page, "dark");
    await marker.expectSoft();
  });

  test("signing in through the form lands in the app, still dark, without a reload", async ({ page }) => {
    await page.goto("/login");
    await expectThemeMeta(page, "dark");
    const marker = await softNavMarker(page);
    await page.locator(".login-submit").click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.locator(".topbar .theme-toggle")).toBeVisible();
    await expectThemeMeta(page, "dark");
    await marker.expectSoft();
  });
});

