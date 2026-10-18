import { defineConfig, devices } from "@playwright/test";
import { e2eDatabaseUrl } from "./tests/e2e/database";

// End-to-end tests run against their own `next dev` on PORT, backed by a throwaway copy of the database
// (created in global setup, dropped in global teardown). The dev server on :3000 and its data are never touched.
const PORT = 3200;
const viewport = { width: 1440, height: 900 };

export default defineConfig({
  testDir: "./tests/e2e",
  // One shared database: run tests one after another, in file order.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-MX",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "dashboard",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport, storageState: "tests/e2e/.auth/user.json" }
    }
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: e2eDatabaseUrl(), NEXT_DIST_DIR: ".next-e2e" }
  }
});
