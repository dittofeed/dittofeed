import config from "./config";
import {
  generateViewInBrowserHash,
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
});
