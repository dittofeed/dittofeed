import { randomUUID } from "node:crypto";

import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

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

    it("should reject invalid domain with .com", async () => {
      const workspaceResult = await bootstrapPostgres({
        workspaceName: randomUUID(),
        workspaceDomain: "gmail.com",
      });
      if (workspaceResult.isOk()) {
        throw new Error("expected to fail with validation error");
      }
      expect(workspaceResult.error.type).toBe(
        CreateWorkspaceErrorType.InvalidDomain,
      );
    });

    it("it should not reject similar domains", async () => {
      unwrap(
        await bootstrapPostgres({
          workspaceName: randomUUID(),
          workspaceDomain: "dittomail.com",
        }),
      );
    });
  });
});
