/* eslint-disable no-await-in-loop -- pages must be exercised sequentially on a single page. */
import { expect, test } from "@playwright/test";

/**
 * The primary dashboard navigation. Kept in sync with
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
    for (const item of NAV_ITEMS) {
      await expect(
        page.locator(`a[href="${item.url}"]`),
        `nav link for ${item.title}`,
      ).toHaveCount(1);
    }
  });

  test("loads every primary page and highlights its nav item", async ({
    page,
  }) => {
    for (const item of NAV_ITEMS) {
      const response = await page.goto(item.url);
      expect(response?.status(), `${item.url} status`).toBeLessThan(400);

      const navLink = page.locator(`a[href="${item.url}"]`);
      await expect(navLink, `${item.title} nav link visible`).toBeVisible();
      await expect(navLink, `${item.title} nav link active`).toHaveClass(
        /Mui-selected/,
      );
    }
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
    await expect(
      page.getByRole("button", { name: "Next" }),
    ).toBeVisible();
  });

  test("segments page renders its table", async ({ page }) => {
    await page.goto("/dashboard/segments");
    await expect(
      page.getByRole("heading", { level: 4, name: "Segments" }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });
});
