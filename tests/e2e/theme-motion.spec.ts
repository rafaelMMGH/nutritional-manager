import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { seedTheme, THEME_KEY } from "./theme-helpers";

// US3 (REQ-12, REQ-13): the reveal when the theme changes, and its absence under reduced motion.
// Chromium does not list view-transition pseudo-element animations in getAnimations(), so the reveal is read from the
// computed style of ::view-transition-new(root). That style reflects the configured pseudo-element rule whenever
// html.theme-vt is set, not a live animation (it reads the same with no transition running). So the tests also count
// document.startViewTransition calls: a real reveal is one call per click. Duration is checked as configured.

const toggleOf = (page: Page) => page.locator(".topbar .topbar-account").getByRole("button", { name: /^Cambiar a tema (oscuro|claro)$/ });
const colorScheme = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), THEME_KEY);

/** Counts calls to document.startViewTransition (theme reveal and React's own navigations alike). */
async function countViewTransitions(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __vtCalls: number };
    w.__vtCalls = 0;
    const original = document.startViewTransition?.bind(document);
    if (!original) return;
    document.startViewTransition = ((...args: Parameters<typeof original>) => {
      w.__vtCalls++;
      return original(...args);
    }) as typeof document.startViewTransition;
  });
}
const viewTransitionCalls = (page: Page) => page.evaluate(() => (window as unknown as { __vtCalls: number }).__vtCalls);

async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(toggleOf(page)).toBeVisible();
}

/** Clicks the switch and samples the root's new-snapshot pseudo-element on the next frames. */
async function clickAndSample(page: Page) {
  return toggleOf(page).evaluate(
    (button) =>
      new Promise<{ names: string[]; durations: string[]; vtClass: boolean; x: string; y: string; r: string }>((resolve) => {
        const names = new Set<string>();
        const durations = new Set<string>();
        let vtClass = false;
        (button as HTMLElement).click();
        let frames = 0;
        const sample = () => {
          const style = getComputedStyle(document.documentElement, "::view-transition-new(root)");
          names.add(style.animationName);
          durations.add(style.animationDuration);
          vtClass ||= document.documentElement.classList.contains("theme-vt");
          if (++frames < 12) return requestAnimationFrame(sample);
          const root = document.documentElement.style;
          resolve({
            names: [...names],
            durations: [...durations],
            vtClass,
            x: root.getPropertyValue("--reveal-x"),
            y: root.getPropertyValue("--reveal-y"),
            r: root.getPropertyValue("--reveal-r")
          });
        };
        requestAnimationFrame(sample);
      })
  );
}

test.describe("REQ-12: the theme change is revealed from the switch", () => {
  test("runs theme-reveal on the new snapshot, within 600 ms, from the center of the switch", async ({ page }) => {
    await countViewTransitions(page);
    await open(page);
    const box = (await toggleOf(page).boundingBox())!;
    const result = await clickAndSample(page);

    expect(await viewTransitionCalls(page), "one startViewTransition per switch click").toBe(1);
    expect(result.vtClass, "html.theme-vt while it runs").toBe(true);
    expect(result.names).toContain("theme-reveal");
    const seconds = result.durations.map((value) => parseFloat(value)).filter((value) => value > 0);
    expect(seconds.length).toBeGreaterThan(0);
    for (const value of seconds) expect(value * 1000).toBeLessThanOrEqual(600);
    expect(parseFloat(result.x)).toBeCloseTo(box.x + box.width / 2, 0);
    expect(parseFloat(result.y)).toBeCloseTo(box.y + box.height / 2, 0);
    expect(parseFloat(result.r)).toBeGreaterThan(0);

    await expect.poll(() => colorScheme(page)).toBe("dark");
    await expect(page.locator("html")).not.toHaveClass(/theme-vt/);
  });

  test("the switch back is revealed too and no marker class is left", async ({ page }) => {
    await seedTheme(page, "dark");
    await countViewTransitions(page);
    await open(page);
    const result = await clickAndSample(page);
    expect(await viewTransitionCalls(page), "one startViewTransition per switch click").toBe(1);
    expect(result.names).toContain("theme-reveal");
    await expect.poll(() => colorScheme(page)).toBe("light");
    await expect(page.locator("html")).not.toHaveClass(/theme-vt/);
  });

  test("without document.startViewTransition the change is instant and raises no error", async ({ page, issues }) => {
    await page.addInitScript(() => {
      (document as unknown as { startViewTransition: undefined }).startViewTransition = undefined;
    });
    await open(page);
    await toggleOf(page).click();
    await expect.poll(() => colorScheme(page)).toBe("dark");
    await expect(page.locator("html")).not.toHaveClass(/theme-vt/);
    expect(await stored(page)).toBe("dark");
    expect(issues).toEqual([]);
  });

  test("three quick clicks end on the last choice with state, storage, icon and name in agreement", async ({ page }) => {
    await open(page);
    const toggle = toggleOf(page);
    await toggle.evaluate((button) => {
      for (let click = 0; click < 3; click++) (button as HTMLElement).click();
    });
    await expect.poll(() => colorScheme(page)).toBe("dark");
    expect(await stored(page)).toBe("dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("html")).not.toHaveClass(/theme-vt/);
    await expect(toggle).toHaveAccessibleName("Cambiar a tema claro");
    await expect(toggle.locator("[data-icon]")).toHaveAttribute("data-icon", "moon");

    // Spaced clicks, each while the previous reveal is still running.
    await toggle.click();
    await toggle.click();
    await expect.poll(() => colorScheme(page)).toBe("dark");
    expect(await stored(page)).toBe("dark");
    await expect(page.locator("html")).not.toHaveClass(/theme-vt/);
  });

  test("the recipe list to detail view transition still starts after a theme switch", async ({ page }) => {
    await countViewTransitions(page);
    await open(page, "/recipes");
    await toggleOf(page).click();
    await expect.poll(() => colorScheme(page)).toBe("dark");
    await expect(page.locator("html")).not.toHaveClass(/theme-vt/);

    const before = await viewTransitionCalls(page);
    await page.locator(".rx-open").first().click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    expect(await viewTransitionCalls(page)).toBeGreaterThan(before);
    expect(await colorScheme(page)).toBe("dark");
  });

  test("a recipe opened within the reveal still navigates, and the theme and marker class settle", async ({ page }) => {
    await countViewTransitions(page);
    await open(page, "/recipes");
    await toggleOf(page).click();
    await page.locator(".rx-open").first().click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    await expect.poll(() => colorScheme(page)).toBe("dark");
    await expect(page.locator("html")).not.toHaveClass(/theme-vt/);
    expect(await stored(page)).toBe("dark");
    expect(await viewTransitionCalls(page)).toBeGreaterThanOrEqual(1);
  });

  test.describe("forced colors", () => {
    test("changes the theme at once, with no view transition", async ({ page }) => {
      await countViewTransitions(page);
      await page.emulateMedia({ forcedColors: "active" });
      await open(page);
      await toggleOf(page).click();
      // Forced colors makes the computed color-scheme "light dark", so read what the app set instead.
      await expect(page.locator("html")).toHaveClass(/dark/);
      expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");
      expect(await viewTransitionCalls(page)).toBe(0);
      await expect(page.locator("html")).not.toHaveClass(/theme-vt/);
      expect(await stored(page)).toBe("dark");
    });
  });
});

test.describe("REQ-13: reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  // Guard: passes against the instant switch too.
  test("changes the theme at once, with no view transition and no movement in the icon", async ({ page }) => {
    await countViewTransitions(page);
    await open(page);
    await toggleOf(page).click();
    await expect.poll(() => colorScheme(page)).toBe("dark");
    expect(await viewTransitionCalls(page)).toBe(0);
    await expect(page.locator("html")).not.toHaveClass(/theme-vt/);

    const icons = await toggleOf(page).locator("svg").evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        return { transform: style.transform, scale: style.scale, rotate: style.rotate, animations: node.getAnimations().length, transition: style.transitionProperty };
      })
    );
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon.transform).toBe("none");
      expect(icon.scale).toBe("none");
      expect(icon.rotate).toBe("none");
      expect(icon.animations).toBe(0);
      expect(icon.transition).not.toMatch(/transform|scale|rotate|all/);
    }
  });
});
