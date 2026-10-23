import { expect, test } from "./fixtures";
import { dynamicMasks, inScopePages, lightLockedPages } from "./theme-helpers";

// REQ-11, REQ-14: the light theme looks like the baseline captured before the theme work. The snapshots are
// local only (tests/e2e/*-snapshots is gitignored: they contain personal data). The "a-" prefix runs this file
// before dashboard.spec.ts changes the data.

const shot = { maxDiffPixelRatio: 0.01, stylePath: "./tests/e2e/screenshot.css", fullPage: true } as const;
const slug = (name: string) => name.replace(/\s+/g, "-");

test.describe("signed in, light", () => {
  test.use({ colorScheme: "light" });

  for (const { name, path } of inScopePages) {
    test(`${name} looks as it did`, async ({ page }) => {
      await page.goto(path());
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${slug(name)}.png`, { ...shot, mask: dynamicMasks(page) });
    });
  }
});

test.describe("signed out, light", () => {
  test.use({ colorScheme: "light", storageState: { cookies: [], origins: [] } });

  for (const { name, path } of lightLockedPages) {
    test.describe(name, () => {
      // An unmatched URL answers 404, which the browser logs as a console error.
      test.use({ expectedIssues: path === "/no-existe" ? [/Failed to load resource.*404/] : [] });

      test("looks as it did", async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveScreenshot(`public-${slug(name)}.png`, shot);
      });
    });
  }
});
