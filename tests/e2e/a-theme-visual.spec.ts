import { expect, expectIssues, test } from "./fixtures";
import { dynamicMasks, inScopePages, lightLockedPages, seedTheme } from "./theme-helpers";

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

// REQ-14: the locked pages are the same pixels whether nothing is stored (light OS), dark is stored, or the OS is dark.
const lockScenarios = [
  { label: "light OS, nothing stored", os: "light", stored: null },
  { label: "stored dark, light OS", os: "light", stored: "dark" },
  { label: "nothing stored, dark OS", os: "dark", stored: null }
] as const;

test.describe("signed out, light", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const { label, os, stored } of lockScenarios) {
    for (const { name, path } of lightLockedPages) {
      test.describe(`${name}, ${label}`, () => {
        // An unmatched URL answers 404, which the browser logs as a console error.
        test.use({ colorScheme: os, expectedIssues: expectIssues(...(path === "/no-existe" ? [/Failed to load resource.*404/] : [])) });

        test("looks as it did", async ({ page }) => {
          await seedTheme(page, stored);
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          await expect(page).toHaveScreenshot(`public-${slug(name)}.png`, shot);
        });
      });
    }
  }
});
