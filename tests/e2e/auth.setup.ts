import { expect, test as setup } from "@playwright/test";

// Signs in once with the demo account (the login form comes prefilled) and saves the session for the other tests.
// Never log out in tests: logout deletes the session.
setup("sign in with the demo account", async ({ page }) => {
  await page.goto("/login");
  await page.locator(".login-submit").click();
  await page.waitForURL("/");
  await expect(page.locator(".home-hello h1")).toHaveText("Hola, Rafael");
  await page.context().storageState({ path: "tests/e2e/.auth/user.json" });
});
