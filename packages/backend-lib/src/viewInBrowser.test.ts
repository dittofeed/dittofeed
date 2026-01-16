import { randomUUID } from "crypto";

import config from "./config";
import {
  generateViewInBrowserHash,
  getEmailForViewInBrowser,
  getStoredEmailForViewInBrowser,
  getViewInBrowserKey,
  storeEmailForViewInBrowser,
} from "./viewInBrowser";

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

  describe("getEmailForViewInBrowser", () => {
    it("returns InvalidHash when hash doesn't match", async () => {
      const result = await getEmailForViewInBrowser({
        workspaceId: randomUUID(),
        messageId: "msg-123",
        hash: "wrong-hash",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("InvalidHash");
      }
    });

    it("returns email content when hash is valid", async () => {
      // Skip if blob storage is not enabled
      if (!config().enableBlobStorage) {
        return;
      }

      const { secretKey } = config();
      if (!secretKey) {
        throw new Error("secretKey not configured");
      }

      const workspaceId = randomUUID();
      const messageId = `msg-${randomUUID()}`;
      const emailBody = "<html><body>Test email for view in browser</body></html>";

      // Store the email
      await storeEmailForViewInBrowser({
        workspaceId,
        messageId,
        body: emailBody,
      });

      // Generate the correct hash using the shared config secret
      const hash = generateViewInBrowserHash({
        workspaceId,
        messageId,
        secret: secretKey,
      });

      // Retrieve the email
      const result = await getEmailForViewInBrowser({
        workspaceId,
        messageId,
        hash,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(emailBody);
      }
    });

    it("returns EmailNotFound when email doesn't exist in blob storage", async () => {
      // Skip if blob storage is not enabled
      if (!config().enableBlobStorage) {
        return;
      }

      const { secretKey } = config();
      if (!secretKey) {
        throw new Error("secretKey not configured");
      }

      const workspaceId = randomUUID();
      const messageId = `msg-${randomUUID()}`;

      // Generate the correct hash (but don't store the email)
      const hash = generateViewInBrowserHash({
        workspaceId,
        messageId,
        secret: secretKey,
      });

      // Try to retrieve the email
      const result = await getEmailForViewInBrowser({
        workspaceId,
        messageId,
        hash,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("EmailNotFound");
      }
    });
  });
});
