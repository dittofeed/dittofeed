import { createAdminApiKey } from "backend-lib/src/adminApiKeys";
import prisma from "backend-lib/src/prisma";
import { Workspace, WorkspaceType } from "backend-lib/src/types";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { v4 as uuidv4 } from "uuid";

import { authenticateAdminApiKey } from "./adminAuth";

describe("authenticateAdminApiKey", () => {
  describe("when an admin api key exists in the workspace", () => {
    let workspace: Workspace;

    beforeEach(async () => {
      workspace = await prisma().workspace.create({
        data: { name: `Workspace ${uuidv4()}`, type: WorkspaceType.Root },
      });
    });

    describe("when the key matches the passed value", () => {
      let adminApiKey: string;
      beforeEach(async () => {
        adminApiKey = unwrap(
          await createAdminApiKey({
            workspaceId: workspace.id,
            name: "my-admin-api-key",
          }),
        ).apiKey;
      });
      it("should return true", async () => {
        const result = await authenticateAdminApiKey({
          workspaceId: workspace.id,
          actualKey: adminApiKey,
        });
        expect(result).toBe(true);
      });
    });
    describe("when the key does not match the passed value", () => {
      beforeEach(async () => {
        await createAdminApiKey({
          workspaceId: workspace.id,
          name: "my-admin-api-key",
        });
      });

      it("should return false", async () => {
        const result = await authenticateAdminApiKey({
          workspaceId: workspace.id,
          actualKey: "wrong-key",
        });
        expect(result).toBe(false);
      });
    });
  });

  describe("when an admin api key does not exist in the workspace", () => {
    let workspace: Workspace;

    beforeEach(async () => {
      workspace = await prisma().workspace.create({
        data: { name: `Workspace ${uuidv4()}`, type: WorkspaceType.Root },
      });
    });

    it("should return false", async () => {
      const result = await authenticateAdminApiKey({
        workspaceId: workspace.id,
        actualKey: "wrong-key",
      });
      expect(result).toBe(false);
    });
  });

  describe("when authenticating against a child workspace with a key from the parent workspace", () => {
    let workspace: Workspace;
    let childWorkspace: Workspace;
    let adminApiKey: string;

    beforeEach(async () => {
      workspace = await prisma().workspace.create({
        data: { name: `Workspace ${uuidv4()}`, type: WorkspaceType.Parent },
      });
      childWorkspace = await prisma().workspace.create({
        data: {
          name: `Child Workspace ${uuidv4()}`,
          type: WorkspaceType.Child,
        },
      });
      await prisma().workspaceRelation.create({
        data: {
          parentWorkspaceId: workspace.id,
          childWorkspaceId: childWorkspace.id,
        },
      });
      adminApiKey = unwrap(
        await createAdminApiKey({
          workspaceId: workspace.id,
          name: "my-admin-api-key",
        }),
      ).apiKey;
    });
    it("should return true", async () => {
      const result = await authenticateAdminApiKey({
        workspaceId: childWorkspace.id,
        actualKey: adminApiKey,
      });
      expect(result).toBe(true);
    });
  });
});
