import {
  MockActivityEnvironment,
  TestWorkflowEnvironment,
} from "@temporalio/testing";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { getNewManualSegmentVersion } from "isomorphic-lib/src/segments";

import { submitBatch } from "../../apps/batch";
import { startQueueWorkflow } from "../../computedProperties/computePropertiesWorkflow/lifecycle";
import { insert } from "../../db";
import * as schema from "../../db/schema";
import { CustomActivityInboundInterceptor } from "../../temporal/activityInboundInterceptor";
import {
  ManualSegmentNode,
  SegmentDefinition,
  SegmentNodeType,
  UserPropertyDefinitionType,
  Workspace,
} from "../../types";
import { insertUserPropertyAssignments } from "../../userProperties";
import { getUsers } from "../../users";
import { createWorkspace } from "../../workspaces/createWorkspace";
import { appendToManualSegment } from "./activities";

jest.mock("../../apps/batch");

const mockSubmitBatch = jest.mocked(submitBatch);

jest.setTimeout(15000);

describe("appendToManualSegment", () => {
  let workspace: Workspace;
  let segmentId: string;
  let idUserPropertyId: string;
  let emailUserPropertyId: string;
  let originalSubmitBatch: typeof submitBatch;
  let testEnv: TestWorkflowEnvironment;
  let activityEnv: MockActivityEnvironment;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    originalSubmitBatch = jest.requireActual("../../apps/batch").submitBatch;
  });

  beforeEach(async () => {
    // Set up Temporal test environment and a mock activity environment that injects
    // the testEnv workflow client into Activity Context (no external Temporal needed).
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
    activityEnv = new MockActivityEnvironment(undefined, {
      interceptors: [
        (ctx) => ({
          inbound: new CustomActivityInboundInterceptor(ctx, {
            workflowClient: testEnv.client.workflow,
          }),
        }),
      ],
    });
    // Ensure the compute-properties queue workflow is running so enqueueRecompute signals succeed
    await startQueueWorkflow({ client: testEnv.client.workflow });

    mockSubmitBatch.mockImplementation(async (...args) => {
      setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        void originalSubmitBatch(...args);
      }, 3000);
      return Promise.resolve();
    });
    workspace = unwrap(
      await createWorkspace({
        name: randomUUID(),
      }),
    );

    const now = Date.now();
    const manualSegmentNode: ManualSegmentNode = {
      id: "1",
      type: SegmentNodeType.Manual,
      version: getNewManualSegmentVersion(now),
    };

    segmentId = randomUUID();
    unwrap(
      await insert({
        table: schema.segment,
        values: {
          id: segmentId,
          workspaceId: workspace.id,
          name: randomUUID(),
          definition: {
            entryNode: manualSegmentNode,
            nodes: [],
          } satisfies SegmentDefinition,
        },
      }),
    );

    const idUserProperty = unwrap(
      await insert({
        table: schema.userProperty,
        values: {
          workspaceId: workspace.id,
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      }),
    );
    idUserPropertyId = idUserProperty.id;

    const emailUserProperty = unwrap(
      await insert({
        table: schema.userProperty,
        values: {
          workspaceId: workspace.id,
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
      }),
    );
    emailUserPropertyId = emailUserProperty.id;

    await insertUserPropertyAssignments([
      {
        workspaceId: workspace.id,
        userId: "user-1",
        userPropertyId: idUserPropertyId,
        value: "user-1",
      },
      {
        workspaceId: workspace.id,
        userId: "user-1",
        userPropertyId: emailUserPropertyId,
        value: "user1@example.com",
      },
      {
        workspaceId: workspace.id,
        userId: "user-2",
        userPropertyId: idUserPropertyId,
        value: "user-2",
      },
      {
        workspaceId: workspace.id,
        userId: "user-2",
        userPropertyId: emailUserPropertyId,
        value: "user2@example.com",
      },
      {
        workspaceId: workspace.id,
        userId: "user-3",
        userPropertyId: idUserPropertyId,
        value: "user-3",
      },
      {
        workspaceId: workspace.id,
        userId: "user-3",
        userPropertyId: emailUserPropertyId,
        value: "user3@example.com",
      },
    ]);
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  it("should append users to manual segment with async event processing", async () => {
    const now = Date.now();
    const userIds = ["user-1", "user-2", "user-3"];

    const result = await activityEnv.run(appendToManualSegment, {
      workspaceId: workspace.id,
      segmentId,
      userIds,
      now,
    });

    expect(result).toBe(true);

    const { users } = unwrap(
      await getUsers({
        workspaceId: workspace.id,
        segmentFilter: [segmentId],
      }),
    );

    expect(users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "user-1" }),
        expect.objectContaining({ id: "user-2" }),
        expect.objectContaining({ id: "user-3" }),
      ]),
    );
    expect(users).toHaveLength(3);
  });
});
