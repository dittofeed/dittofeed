import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { insert } from "./db";
import {
  computedPropertyPeriod as dbComputedPropertyPeriod,
  segment as dbSegment,
  workspace as dbWorkspace,
} from "./db/schema";
import {
  findActiveWorkspaces,
  observeWorkspaceComputeLatency,
} from "./resiliency";
import {
  ComputedPropertyStep,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  Workspace,
  WorkspaceStatusDb,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "./types";
import { upsertWorkspace } from "./workspaces/createWorkspace";

describe("resiliency", () => {
  describe("observeWorkspaceComputeLatency", () => {
    beforeEach(async () => {
      await insert({
        table: dbWorkspace,
        values: {
          id: randomUUID(),
          name: randomUUID(),
          updatedAt: new Date(),
          status: WorkspaceStatusDbEnum.Active,
        },
      });
    });
    test("does not throw", async () => {
      await observeWorkspaceComputeLatency();
    });
  });

  async function createWorkspace(status: WorkspaceStatusDb): Promise<{
    workspaceId: string;
  }> {
    const workspace = await insert({
      table: dbWorkspace,
      values: {
        id: randomUUID(),
        name: randomUUID(),
        status,
        updatedAt: new Date(),
      },
    }).then(unwrap);

    await insert({
      table: dbSegment,
      values: {
        id: randomUUID(),
        workspaceId: workspace.id,
        name: randomUUID(),
        definition: {
          entryNode: {
            id: randomUUID(),
            type: SegmentNodeType.Trait,
            path: "trait",
            operator: {
              type: SegmentOperatorType.Within,
              windowSeconds: 1000,
            },
          },
          nodes: [],
        } satisfies SegmentDefinition,
        updatedAt: new Date(),
      },
    });

    await insert({
      table: dbComputedPropertyPeriod,
      values: {
        id: randomUUID(),
        step: ComputedPropertyStep.ComputeAssignments,
        from: new Date(Date.now() - 1000 * 60),
        to: new Date(),
        type: "Segment",
        version: Date.now().toString(),
        computedPropertyId: randomUUID(),
        workspaceId: workspace.id,
      },
    });

    return { workspaceId: workspace.id };
  }

  describe("findActiveWorkspaces", () => {
    describe("when you have an active and tombstoned workspace", () => {
      let activeWorkspace: string;
      let tombstonedWorkspace: string;
      beforeEach(async () => {
        const [active, tombstoned] = await Promise.all([
          createWorkspace(WorkspaceStatusDbEnum.Active),
          createWorkspace(WorkspaceStatusDbEnum.Tombstoned),
        ]);
        activeWorkspace = active.workspaceId;
        tombstonedWorkspace = tombstoned.workspaceId;
      });

      test("returns active workspaces and their latest compute period", async () => {
        const { workspaces } = await findActiveWorkspaces();
        expect(
          workspaces.find((w) => w.id === activeWorkspace),
        ).not.toBeUndefined();
        expect(
          workspaces.find((w) => w.id === tombstonedWorkspace),
        ).toBeUndefined();
      });
    });
    describe("when you have an active root workspace and a child workspace without any segments or user properties that has old compute periods", () => {
      let activeWorkspace: string;
      let childWorkspace: string;
      beforeEach(async () => {
        const parentWorkspace = await upsertWorkspace({
          name: randomUUID(),
          status: WorkspaceStatusDbEnum.Active,
          updatedAt: new Date(),
          type: WorkspaceTypeAppEnum.Parent,
        }).then(unwrap);

        [activeWorkspace, childWorkspace] = await Promise.all([
          createWorkspace(WorkspaceStatusDbEnum.Active).then(
            (w) => w.workspaceId,
          ),
          upsertWorkspace({
            name: randomUUID(),
            status: WorkspaceStatusDbEnum.Active,
            updatedAt: new Date(),
            type: WorkspaceTypeAppEnum.Child,
            domain: randomUUID(),
            externalId: randomUUID(),
            parentWorkspaceId: parentWorkspace.id,
          })
            .then(unwrap)
            .then((w) => w.id),
        ]);

        await insert({
          table: dbComputedPropertyPeriod,
          values: {
            id: randomUUID(),
            workspaceId: childWorkspace,
            type: "Segment",
            computedPropertyId: randomUUID(),
            version: Date.now().toString(),
            from: new Date(Date.now() - 1000 * 60),
            to: new Date(Date.now() - 1000 * 55),
            step: ComputedPropertyStep.ComputeAssignments,
          },
        });
      });
      test.only("returns active workspaces and their latest compute period but excludes the child workspace with old compute periods and no computed properties", async () => {
        const { workspaces } = await findActiveWorkspaces();
        expect(
          workspaces.find((w) => w.id === activeWorkspace),
        ).not.toBeUndefined();
        expect(workspaces.find((w) => w.id === childWorkspace)).toBeUndefined();
      });
    });
  });
});
