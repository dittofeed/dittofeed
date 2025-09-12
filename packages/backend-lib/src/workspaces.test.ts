/* eslint-disable no-await-in-loop */
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { sleep } from "isomorphic-lib/src/time";

import { ClickHouseQueryBuilder, query as chQuery } from "./clickhouse";
import { db } from "./db";
import * as schema from "./db/schema";
import {
  IdUserPropertyDefinition,
  UserPropertyDefinitionType,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "./types";
import { insertUserEvents } from "./userEvents";
import { upsertUserProperty } from "./userProperties";
import {
  activateTombstonedWorkspace,
  ActivateTombstonedWorkspaceErrorType,
  coldStoreWorkspaceEvents,
  restoreWorkspaceEvents,
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
  describe("cold storage", () => {
    let workspaceId: string;
    const expectedUserEventsCount = 3;
    const expectedInternalEventsCount = 2; // DF* track events
    async function expectCountEventually(
      table: string,
      expected: number,
      timeoutMs = 10000,
      intervalMs = 200,
    ) {
      const start = Date.now();
      // poll until ClickHouse async deletes are visible
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const qb = new ClickHouseQueryBuilder();
        const rows = await (
          await chQuery({
            query: `SELECT count() as c FROM ${table} WHERE workspace_id = ${qb.addQueryValue(
              workspaceId,
              "String",
            )}`,
            query_params: qb.getQueries(),
          })
        ).json<{ c: string }>();
        const count = Number(rows[0]?.c ?? 0);
        if (count === expected) {
          return;
        }
        if (Date.now() - start > timeoutMs) {
          expect(count).toBe(expected);
          return;
        }
        // wait before next poll
        // eslint-disable-next-line no-await-in-loop
        await sleep(intervalMs);
      }
    }

    beforeEach(async () => {
      // create an active workspace
      const [workspace] = await db()
        .insert(schema.workspace)
        .values({
          name: randomUUID(),
          type: WorkspaceTypeAppEnum.Child,
          status: WorkspaceStatusDbEnum.Active,
        })
        .returning();
      if (!workspace) {
        throw new Error("Workspace not created");
      }
      workspaceId = workspace.id;

      // seed events
      const nowIso = new Date().toISOString();
      await insertUserEvents(
        {
          workspaceId,
          userEvents: [
            {
              messageId: randomUUID(),
              messageRaw: {
                type: "identify",
                userId: "user-1",
                traits: { plan: "free" },
                timestamp: nowIso,
              },
            },
            {
              messageId: randomUUID(),
              messageRaw: {
                type: "track",
                event: "DF_TEST_EVENT",
                userId: "user-1",
                properties: { x: 1 },
                timestamp: nowIso,
              },
            },
            {
              messageId: randomUUID(),
              messageRaw: {
                type: "track",
                event: "DF_ANOTHER_EVENT",
                userId: "user-2",
                properties: { y: 2 },
                timestamp: nowIso,
              },
            },
          ],
        },
        { writeModeOverride: "ch-sync" },
      );
    });

    it("cold stores then restores events for a workspace", async () => {
      const qb = new ClickHouseQueryBuilder();

      // preconditions
      const preUserEvents = await (
        await chQuery({
          query: `SELECT count() as c FROM user_events_v2 WHERE workspace_id = ${qb.addQueryValue(
            workspaceId,
            "String",
          )}`,
          query_params: qb.getQueries(),
        })
      ).json<{ c: string }>();
      expect(Number(preUserEvents[0]?.c ?? 0)).toBe(expectedUserEventsCount);

      const preInternal = await (
        await chQuery({
          query: `SELECT count() as c FROM internal_events WHERE workspace_id = ${qb.addQueryValue(
            workspaceId,
            "String",
          )}`,
          query_params: qb.getQueries(),
        })
      ).json<{ c: string }>();
      expect(Number(preInternal[0]?.c ?? 0)).toBe(expectedInternalEventsCount);

      // Cold store
      await coldStoreWorkspaceEvents({ workspaceId });

      await expectCountEventually("user_events_v2", 0);
      await expectCountEventually("internal_events", 0);

      // Restore
      await restoreWorkspaceEvents({ workspaceId });

      const postRestoreUser = await (
        await chQuery({
          query: `SELECT count() as c FROM user_events_v2 WHERE workspace_id = ${qb.addQueryValue(
            workspaceId,
            "String",
          )}`,
          query_params: qb.getQueries(),
        })
      ).json<{ c: string }>();
      expect(Number(postRestoreUser[0]?.c ?? 0)).toBe(expectedUserEventsCount);

      const postRestoreInternal = await (
        await chQuery({
          query: `SELECT count() as c FROM internal_events WHERE workspace_id = ${qb.addQueryValue(
            workspaceId,
            "String",
          )}`,
          query_params: qb.getQueries(),
        })
      ).json<{ c: string }>();
      expect(Number(postRestoreInternal[0]?.c ?? 0)).toBe(
        expectedInternalEventsCount,
      );
    });
  });
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
