import { randomUUID } from "node:crypto";

import { bootstrapPostgres } from "./bootstrap";
import { CreateWorkspaceErrorType } from "./types";

describe("bootstrap", () => {
  describe("bootstrapPostgres", () => {
    it("should reject invalid domain", async () => {
      const workspaceResult = await bootstrapPostgres({
        workspaceName: randomUUID(),
        workspaceDomain: "gmail",
      });
      if (workspaceResult.isOk()) {
        throw new Error("expected to fail with validation error");
      }
      expect(workspaceResult.error.type).toBe(
        CreateWorkspaceErrorType.InvalidDomain,
      );
    });
  });
});
