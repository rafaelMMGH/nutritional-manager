import type { Page } from "@playwright/test";
import { expect, test, watch } from "./fixtures";
import { blockThemeStorage, canvasColor, expectThemeMeta, inScopePages, seedTheme, softNavMarker, THEME_KEY, toRgb, type Theme } from "./theme-helpers";

// US1 (REQ-1 to REQ-5), the mechanism part of REQ-10, and REQ-16: the switch, persistence, no flash, OS default.
// The app starts in the light OS scheme (Playwright default); tests flip it with emulateMedia.

const NAME = { light: "Cambiar a tema oscuro", dark: "Cambiar a tema claro" } as const; // the action, by current theme
const ICON = { light: "sun", dark: "moon" } as const;

const switchOf = (page: Page) => page.locator(".topbar .topbar-account").getByRole("button", { name: /^Cambiar a tema (oscuro|claro)$/ });
const colorScheme = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), THEME_KEY);

async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(switchOf(page)).toBeVisible();
}

/** The switch shows the given theme: icon, accessible name and title. */
async function expectSwitchShows(page: Page, theme: Theme) {
  const toggle = switchOf(page);
  await expect(toggle).toHaveAccessibleName(NAME[theme]);
  await expect(toggle).toHaveAttribute("title", NAME[theme]);
  await expect(toggle.locator("[data-icon]")).toHaveAttribute("data-icon", ICON[theme]);
}

async function expectTheme(page: Page, theme: Theme) {
  await expect.poll(() => colorScheme(page)).toBe(theme);
  await expectThemeMeta(page, theme);
  await expectSwitchShows(page, theme);
}

test.describe("REQ-1: the switch in the topbar", () => {
  for (const width of [1280, 360]) {
    test(`is visible, at least 44×44, named for the action and without a pressed state at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const { name, path } of inScopePages) {
        await open(page, path());
        const toggle = switchOf(page);
        const box = (await toggle.boundingBox())!;
        expect(box.width, `${name} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${name} height`).toBeGreaterThanOrEqual(44);
        await expectSwitchShows(page, "light");
        await expect(toggle, `${name} has no pressed state`).not.toHaveAttribute("aria-pressed", /.*/);
      }
    });
  }

  test("is operable with Tab and Enter or Space", async ({ page }) => {
    await open(page);
    const toggle = switchOf(page);
    await page.locator(".user-chip").focus();
    for (let presses = 0; presses < 10 && !(await toggle.evaluate((element) => element === document.activeElement)); presses++) await page.keyboard.press("Tab");
    await expect(toggle).toBeFocused();

    await page.keyboard.press("Enter");
    await expectTheme(page, "dark");
    await page.keyboard.press("Space");
    await expectTheme(page, "light");
  });

  test("with forced colors it is visible, focusable and still stores the choice", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await open(page);
    const toggle = switchOf(page);
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => stored(page)).toBe("dark");
  });
});

test.describe("REQ-2 and REQ-10: switching the page", () => {
  test("toggles light and dark, with matching icon, name, color-scheme and theme-color", async ({ page }) => {
    const { THEME_COLORS } = await import("../../src/lib/theme");
    await open(page);
    await expectTheme(page, "light");
    const lightCanvas = await canvasColor(page);
    expect(lightCanvas).toEqual(await toRgb(page, THEME_COLORS.light));

    await switchOf(page).click();
    await expectTheme(page, "dark");
    const darkCanvas = await canvasColor(page);
    expect(darkCanvas).not.toEqual(lightCanvas);
    expect(darkCanvas).toEqual(await toRgb(page, THEME_COLORS.dark));

    await switchOf(page).click();
    await expectTheme(page, "light");
    expect(await canvasColor(page)).toEqual(lightCanvas);
  });

  test("native controls render dark: the time input reports a dark color-scheme", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Editar horarios" }).click();
    const input = page.locator(".home-time-input").first();
    expect(await input.evaluate((element) => getComputedStyle(element).colorScheme)).toBe("light");

    await switchOf(page).click();
    await expectTheme(page, "dark");
    expect(await input.evaluate((element) => getComputedStyle(element).colorScheme)).toBe("dark");
  });

  test("the assistant panel stays open while the page re-themes", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Abrir asistente" }).click();
    const panel = page.locator("#assistant-chat-panel");
    await expect(panel).toHaveClass(/open/);
    const before = await panel.evaluate((element) => getComputedStyle(element).backgroundColor);

    await switchOf(page).click();
    await expectTheme(page, "dark");
    await expect(panel).toHaveClass(/open/);
    expect(await panel.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(before);
  });

  test("switching with a popover open gives no error", async ({ page }) => {
    await open(page);
    await page.locator(".user-chip").click();
    await expect(page.locator(".user-popover")).toBeVisible();
    await switchOf(page).click();
    await expectTheme(page, "dark");
  });
});

test.describe("REQ-3: the choice persists", () => {
  test("survives a reload and a new tab", async ({ page, context, issues }) => {
    await open(page);
    await switchOf(page).click();
    await expectTheme(page, "dark");

    await page.reload();
    await expectTheme(page, "dark");

    const tab = await context.newPage();
    watch(tab, issues);
    await open(tab);
    await expectTheme(tab, "dark");
  });

  test("survives signing out and signing in again", async ({ browser, baseURL, issues }) => {
    // A fresh context with its own session: logging out must never delete the shared one.
    const context = await browser.newContext({ baseURL, locale: "es-MX", storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    watch(page, issues);
    const signIn = async () => {
      await page.goto("/login");
      await page.locator(".login-submit").click();
      await page.waitForURL("/");
      await expect(switchOf(page)).toBeVisible();
    };
    try {
      await signIn();
      await switchOf(page).click();
      await expectTheme(page, "dark");

      await page.locator(".user-chip").click();
      await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
      await page.waitForURL("**/login");
      await signIn();
      await expectTheme(page, "dark");
    } finally {
      await context.close();
    }
  });

  test("with storage blocked the switch still toggles, a warning is logged and the next load follows the OS", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (message) => message.type() === "warning" && warnings.push(message.text()));
    await blockThemeStorage(page);

    await open(page);
    await switchOf(page).click();
    await expectTheme(page, "dark");
    await expect.poll(() => warnings.filter((text) => /theme/i.test(text)).length).toBeGreaterThan(0);

    // Nothing could be stored, but the click is still an explicit choice: OS changes in this page must not undo it.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForTimeout(300);
    await expectTheme(page, "dark");

    await page.reload();
    await expectTheme(page, "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expectTheme(page, "dark");
  });
});

test.describe("REQ-4: the theme is in the document before any app script runs", () => {
  /** Records html color-scheme when <body> is first inserted and on every later change of html. */
  async function recordColorScheme(page: Page) {
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
  }

  test("the switch shows the stored theme's icon at first paint, before the app hydrates", async ({ page }) => {
    // Empty app scripts keep the page unhydrated; the inline init script and the CSS still run.
    await page.route(/\/_next\/static\/.*\.js(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await seedTheme(page, "dark");
    await page.goto("/");
    const opacity = (icon: string) => page.locator(`.topbar .theme-toggle .theme-icon-${icon}`).evaluate((element) => getComputedStyle(element).opacity);
    await expect.poll(() => colorScheme(page)).toBe("dark");
    await expect.poll(() => opacity("moon")).toBe("1");
    expect(await opacity("sun")).toBe("0");
  });

  for (const [chosen, os] of [["dark", "light"], ["light", "dark"]] as const) {
    test(`a stored ${chosen} choice beats the ${os} OS from the first delivered document`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: os });
      await seedTheme(page, chosen);
      await recordColorScheme(page);
      for (const { name, path } of inScopePages) {
        await page.goto(path());
        await expect(switchOf(page)).toBeVisible();
        await page.waitForLoadState("networkidle");
        const seen = await page.evaluate(() => (window as unknown as { __schemes: string[] }).__schemes);
        expect(seen[0], `${name}: color-scheme at <body> insertion`).toBe(chosen);
        expect(new Set(seen), `${name}: no change through hydration`).toEqual(new Set([chosen]));
      }
    });
  }
});

test.describe("REQ-5: with no stored choice the theme follows the OS", () => {
  for (const os of ["dark", "light"] as const) {
    test(`loads ${os} when the OS is ${os}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: os });
      await open(page);
      await expectTheme(page, os);
      expect(await stored(page)).toBeNull();
    });
  }

  test("follows a live OS change without reloading, with the assistant, a popover and a dialog open", async ({ page }) => {
    await open(page);
    const marker = await softNavMarker(page);
    await expectTheme(page, "light");

    await page.getByRole("button", { name: "Abrir asistente" }).click();
    await page.locator(".user-chip").click();
    await page.emulateMedia({ colorScheme: "dark" });
    await expectTheme(page, "dark");
    await expect(page.locator("#assistant-chat-panel")).toHaveClass(/open/);
    await expect(page.locator(".user-popover")).toBeVisible();
    await marker.expectSoft();

    await page.locator(".user-chip").click();
    await page.locator(".assistant-chat-close").click();
    await page.locator(".home-promo-btn").click();
    await expect(page.locator(".upload-wizard-modal")).toBeVisible();
    await page.emulateMedia({ colorScheme: "light" });
    await expectTheme(page, "light");
    await expect(page.locator(".upload-wizard-modal")).toBeVisible();
    await marker.expectSoft();
  });

  for (const [chosen, os] of [["light", "dark"], ["dark", "light"]] as const) {
    test(`a stored ${chosen} choice ignores an OS change to ${os}`, async ({ page }) => {
      await seedTheme(page, chosen);
      await page.emulateMedia({ colorScheme: chosen });
      await open(page);
      await expectTheme(page, chosen);
      await page.emulateMedia({ colorScheme: os });
      // Give a (wrong) listener time to act before asserting it did not.
      await page.waitForTimeout(300);
      await expectTheme(page, chosen);
    });
  }

  test("a choice made with the switch ignores later OS changes", async ({ page }) => {
    await open(page);
    await switchOf(page).click();
    await expectTheme(page, "dark");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForTimeout(300);
    await expectTheme(page, "dark");
  });
});

test.describe("REQ-16: printing is always light", () => {
  for (const { name, path } of inScopePages) {
    test(`${name} prints with the light page background and text while dark is active`, async ({ page }) => {
      await open(page, path());
      const paint = () => page.evaluate(() => ({ canvas: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color }));
      const light = await paint();

      await switchOf(page).click();
      await expectTheme(page, "dark");
      expect(await paint()).not.toEqual(light);

      await page.emulateMedia({ media: "print" });
      expect(await paint()).toEqual(light);
      expect(await colorScheme(page)).toBe("light");
    });
  }
});
