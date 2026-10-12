import { expect, test } from "@playwright/test";

/**
 * Requires a user that already exists in the workspace, e.g. one seeded through
 * the public `identify` API. Set E2E_USER_ID to enable this spec.
 */
const userId = process.env.E2E_USER_ID;

test.skip(!userId, "set E2E_USER_ID to a user that exists in the workspace");

test.describe("user detail", () => {
  test("renders the user's properties", async ({ page }) => {
    const response = await page.goto(`/dashboard/users/${userId}`);
    expect(response?.status()).toBeLessThan(400);

    await expect(
      page.getByRole("heading", { level: 2, name: "User Properties" }),
    ).toBeVisible();
  });
});
