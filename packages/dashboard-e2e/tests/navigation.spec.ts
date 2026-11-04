import { expect, test } from "@playwright/test";

/**
 * UI smoke coverage for the dashboard shell. Kept intentionally small: the
 * behavioural coverage lives in `pipeline.spec.ts` and in the package test
 * suites, so this file only proves that the dashboard boots, renders its
 * navigation, and loads the two heaviest list pages.
 *
 * The primary navigation is kept in sync with
 * packages/dashboard/src/components/menuItems/main.ts.
 */
const NAV_ITEMS = [
  { title: "Analysis", url: "/dashboard/analysis/overview" },
  { title: "Deliveries", url: "/dashboard/deliveries" },
  { title: "Journeys", url: "/dashboard/journeys" },
  { title: "Message Templates", url: "/dashboard/templates" },
  { title: "Broadcasts", url: "/dashboard/broadcasts" },
  { title: "Users", url: "/dashboard/users" },
  { title: "Segments", url: "/dashboard/segments" },
  { title: "User Properties", url: "/dashboard/user-properties" },
  { title: "Subscription Groups", url: "/dashboard/subscription-groups" },
  { title: "Events", url: "/dashboard/events" },
] as const;

test.describe("dashboard shell", () => {
  test("renders every primary navigation item", async ({ page }) => {
    await page.goto("/dashboard/users");
    await Promise.all(
      NAV_ITEMS.map((item) =>
        expect(
          page.locator(`a[href="${item.url}"]`),
          `nav link for ${item.title}`,
        ).toHaveCount(1),
      ),
    );
  });

  test("highlights the users page in the navigation", async ({ page }) => {
    const response = await page.goto("/dashboard/users");
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('a[href="/dashboard/users"]')).toHaveClass(
      /Mui-selected/,
    );
  });

  test("highlights the journeys page in the navigation", async ({ page }) => {
    const response = await page.goto("/dashboard/journeys");
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('a[href="/dashboard/journeys"]')).toHaveClass(
      /Mui-selected/,
    );
  });
});

test.describe("core pages", () => {
  test("users page renders its table", async ({ page }) => {
    await page.goto("/dashboard/users");
    await expect(
      page.getByRole("heading", { level: 4, name: "Users" }),
    ).toBeVisible();

    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(
      table.getByRole("columnheader", { name: "User ID" }),
    ).toBeVisible();
    await expect(
      table.getByRole("columnheader", { name: "Segments" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
  });

  test("segments page renders its table", async ({ page }) => {
    await page.goto("/dashboard/segments");
    await expect(
      page.getByRole("heading", { level: 4, name: "Segments" }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });
});
