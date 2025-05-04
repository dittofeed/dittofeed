import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import config, { type Config } from "../../../config";
import { db, insert } from "../../../db";
import * as schema from "../../../db/schema";
import { toSegmentResource } from "../../../segments";
import {
  ComputedPropertyStepEnum,
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

// Define the type for the actual config module
type ActualConfigModule = { default: () => Config };

// Load the actual config module with the defined type
// const actualConfigModule: ActualConfigModule = jest.requireActual("../../../config");

jest.mock("../../../config", () => ({
  __esModule: true, // this property makes it work correctly with ESM imports
  default: jest.fn().mockImplementation(() => {
    // Require the actual module inside the mock factory
    const actualModule: ActualConfigModule =
      jest.requireActual("../../../config");
    return actualModule.default();
  }),
}));

// Keep a reference to the actual implementation's default export
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const actualConfig: () => Config =
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  jest.requireActual("../../../config").default;

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
            step: ComputedPropertyStepEnum.ComputeAssignments,
          }),
          createPeriods({
            workspaceId: workspace2.id,
            userProperties: [],
            segments: segments2,
            now,
            step: ComputedPropertyStepEnum.ComputeAssignments,
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
          step: ComputedPropertyStepEnum.ComputeAssignments,
        });
      });
      it("should return the workspace", async () => {
        const dueWorkspaces = await findDueWorkspaces({
          now,
          interval: 2 * 60 * 1000,
          limit: 10000,
        });

        expect(dueWorkspaces.workspaceIds).toContain(workspace.id);
        expect(dueWorkspaces.workspaceIds).not.toContain(workspace2.id);
      });
    });

    describe("when a workspace's latest re-computed property period is older than the interval and the global computed properties feature is enabled", () => {
      let segmentId1: string;
      let segmentId2: string;
      let workspace2: Workspace;
      let now: number;

      beforeEach(async () => {
        (config as jest.MockedFunction<typeof config>).mockImplementation(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          () => ({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            ...actualConfig(),
            useGlobalComputedProperties: true,
          }),
        );

        now = new Date().getTime();

        workspace2 = unwrap(
          await createWorkspace({
            name: randomUUID(),
          }),
        );

        segmentId1 = randomUUID();
        segmentId2 = randomUUID();

        const segments1: SavedSegmentResource[] = [
          unwrap(
            (
              await insert({
                table: schema.segment,
                values: {
                  id: segmentId1,
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
                  id: segmentId2,
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
            step: ComputedPropertyStepEnum.ComputeAssignments,
          }),
          createPeriods({
            workspaceId: workspace2.id,
            userProperties: [],
            segments: segments2,
            now,
            step: ComputedPropertyStepEnum.ComputeAssignments,
          }),
        ]);

        now += 2 * 61 * 1000;

        await createPeriods({
          workspaceId: workspace2.id,
          userProperties: [],
          segments: segments2,
          now,
          step: ComputedPropertyStepEnum.ComputeAssignments,
        });
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it("should return the workspace", async () => {
        const dueWorkspaces = await findDueWorkspaces({
          now,
          interval: 2 * 60 * 1000,
          limit: 10000,
        });

        expect(dueWorkspaces.workspaceIds).toContain(workspace.id);
        expect(dueWorkspaces.workspaceIds).not.toContain(workspace2.id);
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
          limit: 10000,
        });

        expect(dueWorkspaces.workspaceIds).toContain(workspace.id);
      });
    });
  });
});
