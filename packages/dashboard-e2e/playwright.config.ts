import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Dittofeed end-to-end tests.
 *
 * The tests drive a *running* Dittofeed stack (dashboard + api). Start it with
 * `docker compose --profile apps up` (or `yarn dev`) before running the tests.
 *
 * Base URLs can be overridden through the same env vars the dashboard/api use:
 *   DASHBOARD_URL      (default http://localhost:3000)
 *   DASHBOARD_API_BASE (default http://localhost:3001)
 */
const dashboardBaseUrl = process.env.DASHBOARD_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: dashboardBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // The dashboard and api are expected to already be running. Uncomment to let
  // Playwright manage their lifecycle instead:
  //
  // webServer: [
  //   {
  //     command: "yarn workspace dashboard start",
  //     url: dashboardBaseUrl,
  //     reuseExistingServer: true,
  //     timeout: 120_000,
  //   },
  // ],
});
