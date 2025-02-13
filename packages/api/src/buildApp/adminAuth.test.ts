import { createAdminApiKey } from "backend-lib/src/adminApiKeys";
import { db, endPool } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import {
  Workspace,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "backend-lib/src/types";
import { createWorkspace } from "backend-lib/src/workspaces";
import { eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { v4 as uuidv4 } from "uuid";

import { authenticateAdminApiKey } from "./adminAuth";

describe("authenticateAdminApiKey", () => {
  describe("when an admin api key exists in the workspace", () => {
    let workspace: Workspace;

    beforeEach(async () => {
      workspace = await createWorkspace({
        id: uuidv4(),
        name: `Workspace ${uuidv4()}`,
        type: WorkspaceTypeAppEnum.Root,
        updatedAt: new Date(),
        createdAt: new Date(),
      }).then(unwrap);
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

    describe("when the key matches the passed value, but it's from an inactive workspace", () => {
      let adminApiKey: string;
      beforeEach(async () => {
        adminApiKey = unwrap(
          await createAdminApiKey({
            workspaceId: workspace.id,
            name: "my-admin-api-key",
          }),
        ).apiKey;
        await db()
          .update(schema.workspace)
          .set({
            status: WorkspaceStatusDbEnum.Tombstoned,
          })
          .where(eq(schema.workspace.id, workspace.id));
      });
      it("should return false", async () => {
        const result = await authenticateAdminApiKey({
          workspaceId: workspace.id,
          actualKey: adminApiKey,
        });
        expect(result).toBe(false);
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
      workspace = await createWorkspace({
        id: uuidv4(),
        name: `Workspace ${uuidv4()}`,
        type: WorkspaceTypeAppEnum.Root,
        updatedAt: new Date(),
        createdAt: new Date(),
      }).then(unwrap);
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
      workspace = await createWorkspace({
        id: uuidv4(),
        name: `Workspace ${uuidv4()}`,
        type: WorkspaceTypeAppEnum.Parent,
        status: WorkspaceStatusDbEnum.Active,
        updatedAt: new Date(),
        createdAt: new Date(),
      }).then(unwrap);
      childWorkspace = await createWorkspace({
        id: uuidv4(),
        name: `Child Workspace ${uuidv4()}`,
        type: WorkspaceTypeAppEnum.Child,
        status: WorkspaceStatusDbEnum.Active,
        parentWorkspaceId: workspace.id,
        updatedAt: new Date(),
        createdAt: new Date(),
      }).then(unwrap);
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

  describe("when authenticating against a child workspace with a key from the parent workspace, using an externalId", () => {
    let workspace: Workspace;
    let childWorkspaceExternalId: string;
    let adminApiKey: string;

    beforeEach(async () => {
      workspace = await createWorkspace({
        id: uuidv4(),
        name: `Workspace ${uuidv4()}`,
        type: WorkspaceTypeAppEnum.Parent,
        updatedAt: new Date(),
        createdAt: new Date(),
      }).then(unwrap);
      childWorkspaceExternalId = `child-workspace-external-id-${uuidv4()}`;
      await createWorkspace({
        id: uuidv4(),
        name: `Child Workspace ${uuidv4()}`,
        type: WorkspaceTypeAppEnum.Child,
        externalId: childWorkspaceExternalId,
        parentWorkspaceId: workspace.id,
        updatedAt: new Date(),
        createdAt: new Date(),
      }).then(unwrap);

      adminApiKey = unwrap(
        await createAdminApiKey({
          workspaceId: workspace.id,
          name: "my-admin-api-key",
        }),
      ).apiKey;
    });
    it("should return true with the correct externalId", async () => {
      const result = await authenticateAdminApiKey({
        externalId: childWorkspaceExternalId,
        actualKey: adminApiKey,
      });
      expect(result).toBe(true);
    });

    it("should return false with the wrong externalId", async () => {
      const result = await authenticateAdminApiKey({
        externalId: `wrong-external-id-${uuidv4()}`,
        actualKey: adminApiKey,
      });
      expect(result).toBe(false);
    });
  });
});

// afterAll(async () => {
//   console.log("test afterAll PID:", process.pid);
//   await endPool();
//   return null;
// });
