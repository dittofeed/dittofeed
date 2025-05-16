import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { getNewManualSegmentVersion } from "isomorphic-lib/src/segments";

import { createEnvAndWorker } from "../../test/temporal";
import { db, insert } from "../db";
import * as schema from "../db/schema";
import {
  ManualSegmentNode,
  SegmentDefinition,
  SegmentNodeType,
  Workspace,
} from "../types";
import { createWorkspace } from "../workspaces/createWorkspace";
import {
  ManualSegmentOperationTypeEnum,
  manualSegmentWorkflow,
} from "./manualSegmentWorkflow";
import { segmentUpdateSignal } from "../journeys/userWorkflow";

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

  it("should be able to run multiple append and replace operations in sequence", () => {
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
            signal: segmentUpdateSignal,
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
      });
    });
  });
});
