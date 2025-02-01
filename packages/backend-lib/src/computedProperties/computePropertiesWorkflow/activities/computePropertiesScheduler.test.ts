import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import {
  ComputedPropertyStep,
  SavedSegmentResource,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  Workspace,
} from "../../../types";
import { createWorkspace } from "../../../workspaces";
import { createPeriods } from "../../periods";
import { findDueWorkspaces } from "../activities";

describe("computePropertiesScheduler activities", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = unwrap(
      await createWorkspace({
        name: randomUUID(),
      }),
    );
  });

  describe("findDueWorkspaces", () => {
    function createSegmentDefinition(): SegmentDefinition {
      return {
        nodes: [],
        entryNode: {
          id: randomUUID(),
          type: SegmentNodeType.Trait,
          path: randomUUID(),
          operator: {
            type: SegmentOperatorType.Equals,
            value: randomUUID(),
          },
        },
      };
    }
    describe("when a workspace's latest re-computed property period is older than the interval", () => {
      let dueSegmentId: string;
      let notDueSegmentId: string;
      let workspace2: Workspace;
      let now: number;

      beforeEach(async () => {
        now = new Date().getTime();

        workspace2 = unwrap(
          await createWorkspace({
            name: randomUUID(),
          }),
        );

        dueSegmentId = randomUUID();
        notDueSegmentId = randomUUID();

        const segments1: SavedSegmentResource[] = [
          {
            id: dueSegmentId,
            name: randomUUID(),
            createdAt: now - 1000,
            updatedAt: now - 1000,
            workspaceId: workspace.id,
            definitionUpdatedAt: now - 1000,
            definition: createSegmentDefinition(),
          },
        ];

        const segments2: SavedSegmentResource[] = [
          {
            id: notDueSegmentId,
            name: randomUUID(),
            createdAt: now - 1000,
            updatedAt: now - 1000,
            workspaceId: workspace.id,
            definitionUpdatedAt: now - 1000,
            definition: createSegmentDefinition(),
          },
        ];

        await Promise.all([
          createPeriods({
            workspaceId: workspace.id,
            userProperties: [],
            segments: segments1,
            now,
            step: ComputedPropertyStep.ComputeAssignments,
          }),
          createPeriods({
            workspaceId: workspace2.id,
            userProperties: [],
            segments: segments2,
            now,
            step: ComputedPropertyStep.ComputeAssignments,
          }),
        ]);

        now += 2 * 61 * 1000;

        await createPeriods({
          workspaceId: workspace2.id,
          userProperties: [],
          segments: segments2,
          now,
          step: ComputedPropertyStep.ComputeAssignments,
        });
      });
      it("should return the workspace", async () => {
        const dueWorkspaces = await findDueWorkspaces({
          now,
          interval: 2 * 60 * 1000,
        });

        expect(dueWorkspaces.workspaceIds).toEqual([workspace.id]);
      });
    });
  });
});
