import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowHandle,
} from "@temporalio/client";

import config from "../config";
import connectWorkflowClient from "../temporal/connectWorkflowClient";
import {
  ClearManualSegmentRequest,
  GetManualSegmentStatusRequest,
  GetManualSegmentStatusResponse,
  UpdateManualSegmentUsersRequest,
} from "../types";
import {
  enqueueManualSegmentOperation,
  generateManualSegmentWorkflowId,
  ManualSegmentOperation,
  ManualSegmentOperationTypeEnum,
  manualSegmentWorkflow,
} from "./manualSegmentWorkflow";

export async function updateManualSegmentUsers({
  workspaceId,
  segmentId,
  userIds,
  append = false,
  sync,
}: UpdateManualSegmentUsersRequest): Promise<void> {
  const temporalClient = await connectWorkflowClient();
  const manualSegmentOperation: ManualSegmentOperation = {
    type: append
      ? ManualSegmentOperationTypeEnum.Append
      : ManualSegmentOperationTypeEnum.Replace,
    userIds,
  };

  const handle = await temporalClient.signalWithStart(manualSegmentWorkflow, {
    workflowId: generateManualSegmentWorkflowId({
      workspaceId,
      segmentId,
    }),
    signal: enqueueManualSegmentOperation,
    signalArgs: [manualSegmentOperation],
    args: [
      {
        workspaceId,
        segmentId,
      },
    ],
    taskQueue: config().computedPropertiesTaskQueue,
  });

  if (sync) {
    await handle.result();
  }
}

export async function clearManualSegment({
  workspaceId,
  segmentId,
}: ClearManualSegmentRequest): Promise<void> {
  const temporalClient = await connectWorkflowClient();
  const manualSegmentOperation: ManualSegmentOperation = {
    type: ManualSegmentOperationTypeEnum.Clear,
  };

  const handle = await temporalClient.signalWithStart(manualSegmentWorkflow, {
    workflowId: generateManualSegmentWorkflowId({
      workspaceId,
      segmentId,
    }),
    signal: enqueueManualSegmentOperation,
    signalArgs: [manualSegmentOperation],
    args: [
      {
        workspaceId,
        segmentId,
      },
    ],
    taskQueue: config().computedPropertiesTaskQueue,
  });

  await handle.result();
}

export async function getManualSegmentStatus({
  workspaceId,
  segmentId,
}: GetManualSegmentStatusRequest): Promise<GetManualSegmentStatusResponse> {
  throw new Error("Not implemented");
}
