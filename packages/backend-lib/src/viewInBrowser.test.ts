import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { SecretNames } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import config from "./config";
import { db } from "./db";
import { secret as dbSecret } from "./db/schema";
import {
  generateViewInBrowserHash,
  getStoredEmailForViewInBrowser,
  getViewInBrowserKey,
  storeEmailForViewInBrowser,
  upsertViewInBrowserSecret,
} from "./viewInBrowser";
import { createWorkspace } from "./workspaces";

describe("viewInBrowser", () => {
  describe("generateViewInBrowserHash", () => {
    it("produces consistent hash for same inputs", () => {
      const params = {
        workspaceId: "workspace-123",
        messageId: "message-456",
        secret: "test-secret-key",
      };

      const hash1 = generateViewInBrowserHash(params);
      const hash2 = generateViewInBrowserHash(params);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe("string");
      expect(hash1.length).toBeGreaterThan(0);
    });

    it("produces different hash for different inputs", () => {
      const secret = "test-secret-key";

      const hash1 = generateViewInBrowserHash({
        workspaceId: "workspace-123",
        messageId: "message-456",
        secret,
      });

      const hash2 = generateViewInBrowserHash({
        workspaceId: "workspace-123",
        messageId: "message-789",
        secret,
      });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("getViewInBrowserKey", () => {
    it("generates correct blob storage key", () => {
      const key = getViewInBrowserKey({
        workspaceId: "ws-123",
        messageId: "msg-456",
      });

      expect(key).toBe("emails/ws-123/msg-456/body.html");
    });
  });

  describe("storeEmailForViewInBrowser", () => {
    it("returns error when blob storage is not enabled", async () => {
      // Skip if blob storage is enabled (we want to test the disabled case)
      if (config().enableBlobStorage) {
        return;
      }

      const result = await storeEmailForViewInBrowser({
        workspaceId: "ws-123",
        messageId: "msg-456",
        body: "<html><body>Test</body></html>",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("Blob storage is not enabled");
      }
    });

    it("stores email HTML to blob storage when enabled", async () => {
      // Skip if blob storage is not enabled
      if (!config().enableBlobStorage) {
        return;
      }

      const result = await storeEmailForViewInBrowser({
        workspaceId: "ws-123",
        messageId: "msg-456",
        body: "<html><body>Test email content</body></html>",
      });

      expect(result.isOk()).toBe(true);
    });
  });

  describe("getStoredEmailForViewInBrowser", () => {
    it("returns error when blob storage is not enabled", async () => {
      // Skip if blob storage is enabled
      if (config().enableBlobStorage) {
        return;
      }

      const result = await getStoredEmailForViewInBrowser({
        workspaceId: "ws-123",
        messageId: "msg-456",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("Blob storage is not enabled");
      }
    });

    it("returns error when email is not found", async () => {
      // Skip if blob storage is not enabled
      if (!config().enableBlobStorage) {
        return;
      }

      const result = await getStoredEmailForViewInBrowser({
        workspaceId: "non-existent-ws",
        messageId: "non-existent-msg",
      });

      expect(result.isErr()).toBe(true);
    });

    it("retrieves stored email HTML", async () => {
      // Skip if blob storage is not enabled
      if (!config().enableBlobStorage) {
        return;
      }

      const testBody = "<html><body>Retrieved test content</body></html>";
      const workspaceId = "ws-retrieve-test";
      const messageId = "msg-retrieve-test";

      // First store
      await storeEmailForViewInBrowser({ workspaceId, messageId, body: testBody });

      // Then retrieve
      const result = await getStoredEmailForViewInBrowser({ workspaceId, messageId });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(testBody);
      }
    });
  });

  describe("upsertViewInBrowserSecret", () => {
    it("creates a secret and is idempotent", async () => {
      const workspace = unwrap(
        await createWorkspace({
          id: randomUUID(),
          name: `test-${randomUUID()}`,
          updatedAt: new Date(),
        }),
      );

      // First call should create the secret
      await upsertViewInBrowserSecret({ workspaceId: workspace.id });

      // Verify the secret was created
      const secret1 = await db().query.secret.findFirst({
        where: and(
          eq(dbSecret.workspaceId, workspace.id),
          eq(dbSecret.name, SecretNames.ViewInBrowser),
        ),
      });

      expect(secret1).toBeDefined();
      expect(secret1?.value).toBeTruthy();

      // Second call should be idempotent (not throw, return same secret)
      await upsertViewInBrowserSecret({ workspaceId: workspace.id });

      const secret2 = await db().query.secret.findFirst({
        where: and(
          eq(dbSecret.workspaceId, workspace.id),
          eq(dbSecret.name, SecretNames.ViewInBrowser),
        ),
      });

      expect(secret2?.id).toBe(secret1?.id);
      expect(secret2?.value).toBe(secret1?.value);
    });
  });
});
