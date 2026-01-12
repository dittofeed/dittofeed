/**
 * @group temporal
 */
/* eslint-disable no-await-in-loop */
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { getNewManualSegmentVersion } from "isomorphic-lib/src/segments";
import { sleep } from "isomorphic-lib/src/time";

import { createWorker } from "../../test/temporal";
import {
  COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
  getQueueStateQuery,
} from "../computedProperties/computePropertiesQueueWorkflow";
import { startQueueWorkflow } from "../computedProperties/computePropertiesWorkflow/lifecycle";
import { insert } from "../db";
import * as schema from "../db/schema";
import {
  ManualSegmentNode,
  SegmentDefinition,
  SegmentNodeType,
  UserPropertyDefinitionType,
  Workspace,
} from "../types";
import { insertUserPropertyAssignments } from "../userProperties";
import { getUsers } from "../users";
import { createWorkspace } from "../workspaces/createWorkspace";
import {
  enqueueManualSegmentOperation,
  ManualSegmentOperationTypeEnum,
  manualSegmentWorkflow,
} from "./manualSegmentWorkflow";

jest.setTimeout(30000);

describe("ManualSegmentsWorkflow", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv.teardown();
  });

  beforeEach(async () => {
    workspace = unwrap(
      await createWorkspace({
        name: randomUUID(),
      }),
    );
    worker = await createWorker({
      testEnv,
    });
  });

  describe("when running multiple append and replace operations in sequence", () => {
    beforeEach(async () => {
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
      await insertUserPropertyAssignments([
        {
          workspaceId: workspace.id,
          userId: "not-in-segment",
          userPropertyId: idUserProperty.id,
          value: "not-in-segment",
        },
      ]);
    });
    it("should produce the correct segment membership", async () => {
      await worker.runUntil(async () => {
        // Ensure the compute-properties queue workflow is running while worker is active
        await startQueueWorkflow({ client: testEnv.client.workflow });
        async function waitForQueueToBeEmpty() {
          // Wait until the compute-properties queue has no in-flight tasks
          const queueHandle = testEnv.client.workflow.getHandle(
            COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
          );
          for (let i = 0; i < 50; i += 1) {
            const state = await queueHandle.query(getQueueStateQuery);
            if (
              state.inFlightTaskIds.length === 0 &&
              state.priorityQueue.length === 0
            ) {
              break;
            }
            await sleep(500);
          }
        }

        const now = await testEnv.currentTimeMs();
        const manualSegmentNode: ManualSegmentNode = {
          id: "1",
          type: SegmentNodeType.Manual,
          version: getNewManualSegmentVersion(now),
        };
        const segmentId = randomUUID();
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

        const handle1 = await testEnv.client.workflow.signalWithStart(
          manualSegmentWorkflow,
          {
            workflowId: "workflow1",
            taskQueue: "default",
            signal: enqueueManualSegmentOperation,
            args: [
              {
                workspaceId: workspace.id,
                segmentId,
              },
            ],
            signalArgs: [
              {
                type: ManualSegmentOperationTypeEnum.Append,
                userIds: ["1", "2", "3"],
              },
            ],
          },
        );
        await handle1.signal(enqueueManualSegmentOperation, {
          type: ManualSegmentOperationTypeEnum.Append,
          userIds: ["4", "5", "6"],
        });
        await handle1.result();
        await waitForQueueToBeEmpty();

        const { users } = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            segmentFilter: [segmentId],
          }),
        );
        expect(users).not.toContain(
          expect.objectContaining({ id: "not-in-segment" }),
        );
        expect(users).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: "1" }),
            expect.objectContaining({ id: "2" }),
            expect.objectContaining({ id: "3" }),
            expect.objectContaining({ id: "4" }),
            expect.objectContaining({ id: "5" }),
            expect.objectContaining({ id: "6" }),
          ]),
        );
        await testEnv.sleep(1000);

        // Ensure queue workflow is running before subsequent operations
        await startQueueWorkflow({ client: testEnv.client.workflow });
        const handle2 = await testEnv.client.workflow.signalWithStart(
          manualSegmentWorkflow,
          {
            workflowId: "workflow1",
            taskQueue: "default",
            signal: enqueueManualSegmentOperation,
            args: [
              {
                workspaceId: workspace.id,
                segmentId,
              },
            ],
            signalArgs: [
              {
                type: ManualSegmentOperationTypeEnum.Replace,
                userIds: ["1", "2", "3"],
              },
            ],
          },
        );
        await handle2.result();
        await waitForQueueToBeEmpty();

        const { users: users2 } = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            segmentFilter: [segmentId],
          }),
        );
        expect(
          users2,
          "should contain the replaced users after the replace operation",
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: "1" }),
            expect.objectContaining({ id: "2" }),
            expect.objectContaining({ id: "3" }),
          ]),
        );
        expect(
          users2,
          "should have the correct number of users after the replace operation",
        ).toHaveLength(3);

        // Ensure queue workflow is running before clear operation
        await startQueueWorkflow({ client: testEnv.client.workflow });
        const handle3 = await testEnv.client.workflow.signalWithStart(
          manualSegmentWorkflow,
          {
            workflowId: "workflow1",
            taskQueue: "default",
            signal: enqueueManualSegmentOperation,
            args: [
              {
                workspaceId: workspace.id,
                segmentId,
              },
            ],
            signalArgs: [
              {
                type: ManualSegmentOperationTypeEnum.Clear,
              },
            ],
          },
        );
        await handle3.result();
        await waitForQueueToBeEmpty();

        const { users: users3 } = unwrap(
          await getUsers({
            workspaceId: workspace.id,
            segmentFilter: [segmentId],
          }),
        );
        expect(users3).toHaveLength(0);
      });
    });
  });
});
