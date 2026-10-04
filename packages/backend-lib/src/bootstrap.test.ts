import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { bootstrapPostgres } from "./bootstrap";
import { db } from "./db";
import { workspace } from "./db/schema";
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

    it("should reject invalid domain with .com without creating a workspace", async () => {
      const workspaceName = randomUUID();
      const workspaceResult = await bootstrapPostgres({
        workspaceName,
        workspaceDomain: "gmail.com",
      });
      if (workspaceResult.isOk()) {
        throw new Error("expected to fail with validation error");
      }
      expect(workspaceResult.error.type).toBe(
        CreateWorkspaceErrorType.InvalidDomain,
      );
      expect(
        await db().query.workspace.findFirst({
          where: eq(workspace.name, workspaceName),
        }),
      ).toBeUndefined();
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
