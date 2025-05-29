import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { getNewManualSegmentVersion } from "isomorphic-lib/src/segments";

import { createEnvAndWorker } from "../../test/temporal";
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

jest.setTimeout(15000);

describe("ManualSegmentsWorkflow", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  beforeEach(async () => {
    workspace = unwrap(
      await createWorkspace({
        name: randomUUID(),
      }),
    );

    const envAndWorker = await createEnvAndWorker();
    testEnv = envAndWorker.testEnv;
    worker = envAndWorker.worker;
  });

  afterEach(async () => {
    await testEnv.teardown();
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
