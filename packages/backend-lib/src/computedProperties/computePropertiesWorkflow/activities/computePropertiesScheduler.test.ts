import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { Result } from "neverthrow";

import { db, insert } from "../../../db";
import * as schema from "../../../db/schema";
import { toSegmentResource } from "../../../segments";
import {
  ComputedPropertyStep,
  FeatureNamesEnum,
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
          unwrap(
            (
              await insert({
                table: schema.segment,
                values: {
                  id: dueSegmentId,
                  name: randomUUID(),
                  createdAt: new Date(now - 1000),
                  updatedAt: new Date(now - 1000),
                  workspaceId: workspace.id,
                  definitionUpdatedAt: new Date(now - 1000),
                  definition: createSegmentDefinition(),
                },
              })
            ).andThen((s) => {
              if (s === null) {
                throw new Error("Segment not found");
              }
              return toSegmentResource(s);
            }),
          ),
        ];

        const segments2: SavedSegmentResource[] = [
          unwrap(
            (
              await insert({
                table: schema.segment,
                values: {
                  id: notDueSegmentId,
                  name: randomUUID(),
                  createdAt: new Date(now - 1000),
                  updatedAt: new Date(now - 1000),
                  workspaceId: workspace.id,
                  definitionUpdatedAt: new Date(now - 1000),
                  definition: createSegmentDefinition(),
                },
              })
            ).andThen((s) => {
              if (s === null) {
                throw new Error("Segment not found");
              }
              return toSegmentResource(s);
            }),
          ),
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
          db().insert(schema.feature).values({
            workspaceId: workspace.id,
            name: FeatureNamesEnum.ComputePropertiesGlobal,
            enabled: true,
          }),
          db().insert(schema.feature).values({
            workspaceId: workspace2.id,
            name: FeatureNamesEnum.ComputePropertiesGlobal,
            enabled: true,
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
    describe("when a workspace has never been computed", () => {
      beforeEach(async () => {
        await db().insert(schema.feature).values({
          workspaceId: workspace.id,
          name: FeatureNamesEnum.ComputePropertiesGlobal,
          enabled: true,
        });
        await insert({
          table: schema.segment,
          values: {
            name: randomUUID(),
            workspaceId: workspace.id,
            definition: createSegmentDefinition(),
          },
        }).then(unwrap);
      });
      it("should return the workspace", async () => {
        const dueWorkspaces = await findDueWorkspaces({
          now: new Date().getTime(),
          interval: 2 * 60 * 1000,
        });

        expect(dueWorkspaces.workspaceIds).toEqual([workspace.id]);
      });
    });
  });
});
