import { randomUUID } from "crypto";

import { db } from "./db";
import * as schema from "./db/schema";
import {
  IdUserPropertyDefinition,
  UserPropertyDefinitionType,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "./types";
import { upsertUserProperty } from "./userProperties";
import { tombstoneWorkspace } from "./workspaces";

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

    it.only("should be able to create a new workspace with the same external id", async () => {
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

      // create new workspace with same name
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
    });

    it("should fail to activate the tombstoned workspace after creating a new workspace with the same name", async () => {
      // create workspace
      // tombstone workspace
      // create new workspace with same name
      // add resource to new workspace
      // activate tombstoned workspace
      // expect error
    });
  });
});
