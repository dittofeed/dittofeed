import { expect, test } from "@playwright/test";

/**
 * API-level smoke tests. Requires DF_WORKSPACE_ID (the workspace the API
 * resolves when no explicit workspace is supplied); set it to enable this spec.
 */
const apiBaseUrl = process.env.DASHBOARD_API_BASE ?? "http://localhost:3001";
const workspaceId = process.env.DF_WORKSPACE_ID;

test.skip(!workspaceId, "set DF_WORKSPACE_ID to exercise the public API");

test.describe("public api", () => {
  test("POST /api/users returns a users payload", async ({ request }) => {
    const response = await request.post(`${apiBaseUrl}/api/users`, {
      data: { workspaceId, limit: 1 },
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(Array.isArray(body.users)).toBeTruthy();
    expect(typeof body.userCount).toBe("number");
  });
});
