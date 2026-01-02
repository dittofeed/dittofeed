import { generateViewInBrowserHash } from "./viewInBrowser";

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
});
