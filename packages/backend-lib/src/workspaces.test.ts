import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { db } from "./db";
import * as schema from "./db/schema";
import {
  IdUserPropertyDefinition,
  UserPropertyDefinitionType,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "./types";
import { upsertUserProperty } from "./userProperties";
import {
  activateTombstonedWorkspace,
  ActivateTombstonedWorkspaceErrorType,
  tombstoneWorkspace,
} from "./workspaces";

jest.mock("./bootstrap", () => ({
  bootstrapComputeProperties: jest.fn(),
}));

jest.mock("./computedProperties/computePropertiesWorkflow/lifecycle", () => ({
  startComputePropertiesWorkflow: jest.fn(),
  stopComputePropertiesWorkflow: jest.fn(),
  terminateComputePropertiesWorkflow: jest.fn(),
}));

jest.setTimeout(15000);

describe("workspaces", () => {
  describe("after tombstoning a workspace", () => {
    let parentWorkspaceId: string;
    beforeEach(async () => {
      parentWorkspaceId = randomUUID();
      await db().insert(schema.workspace).values({
        id: parentWorkspaceId,
        name: randomUUID(),
        type: WorkspaceTypeAppEnum.Parent,
      });
    });
    it("should be able to create a new workspace with the same name", async () => {
      const name = randomUUID();
      // create workspace
      const [workspace] = await db()
        .insert(schema.workspace)
        .values({
          name,
          parentWorkspaceId,
          type: WorkspaceTypeAppEnum.Child,
          status: WorkspaceStatusDbEnum.Active,
        })
        .returning();
      if (!workspace) {
        throw new Error("Workspace not created");
      }
      // tombstone workspace
      await tombstoneWorkspace(workspace.id);

      // create new workspace with same name
      const [newWorkspace] = await db()
        .insert(schema.workspace)
        .values({
          name,
          parentWorkspaceId,
          type: WorkspaceTypeAppEnum.Child,
          status: WorkspaceStatusDbEnum.Active,
        })
        .returning();
      if (!newWorkspace) {
        throw new Error("Workspace not created");
      }
      // add resource to new workspace
      await upsertUserProperty({
        workspaceId: newWorkspace.id,
        name: "id",
        definition: {
          type: UserPropertyDefinitionType.Id,
        } satisfies IdUserPropertyDefinition,
      });
    });

    it("should be able to create a new workspace with the same external id", async () => {
      const externalId = randomUUID();
      // create workspace
      const [workspace] = await db()
        .insert(schema.workspace)
        .values({
          name: randomUUID(),
          externalId,
          parentWorkspaceId,
          type: WorkspaceTypeAppEnum.Child,
          status: WorkspaceStatusDbEnum.Active,
        })
        .returning();
      if (!workspace) {
        throw new Error("Workspace not created");
      }
      // tombstone workspace
      await tombstoneWorkspace(workspace.id);

      // create new workspace with same external id
      const [newWorkspace] = await db()
        .insert(schema.workspace)
        .values({
          name: randomUUID(),
          externalId,
          parentWorkspaceId,
          type: WorkspaceTypeAppEnum.Child,
          status: WorkspaceStatusDbEnum.Active,
        })
        .returning();
      if (!newWorkspace) {
        throw new Error("Workspace not created");
      }
      // add resource to new workspace
      await upsertUserProperty({
        workspaceId: newWorkspace.id,
        name: "id",
        definition: {
          type: UserPropertyDefinitionType.Id,
        } satisfies IdUserPropertyDefinition,
      });

      const result = await activateTombstonedWorkspace(workspace.id);
      if (result.isOk()) {
        throw new Error("Should have failed to activate tombstoned workspace");
      }
      expect(result.error).toEqual(
        expect.objectContaining({
          type: ActivateTombstonedWorkspaceErrorType.WorkspaceConflict,
        }),
      );
    });

    it("should be able to activate a tombstoned workspace with an external id", async () => {
      const externalId = randomUUID();

      // create workspace
      const [workspace] = await db()
        .insert(schema.workspace)
        .values({
          name: randomUUID(),
          externalId,
          parentWorkspaceId,
          type: WorkspaceTypeAppEnum.Child,
          status: WorkspaceStatusDbEnum.Active,
        })
        .returning();
      if (!workspace) {
        throw new Error("Workspace not created");
      }
      // tombstone workspace
      await tombstoneWorkspace(workspace.id);

      unwrap(await activateTombstonedWorkspace(workspace.id));
      const activatedWorkspace = await db().query.workspace.findFirst({
        where: eq(schema.workspace.id, workspace.id),
      });
      if (!activatedWorkspace) {
        throw new Error("Workspace not activated");
      }
      expect(activatedWorkspace.status).toBe(WorkspaceStatusDbEnum.Active);
      expect(activatedWorkspace.externalId).toBe(externalId);
    });
  });
});
