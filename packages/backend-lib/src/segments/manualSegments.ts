import { and, eq } from "drizzle-orm";

import { getPeriodsByComputedPropertyId } from "../computedProperties/periods";
import config from "../config";
import { db } from "../db";
import * as schema from "../db/schema";
import connectWorkflowClient from "../temporal/connectWorkflowClient";
import {
  ClearManualSegmentRequest,
  ComputedPropertyStepEnum,
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
}: GetManualSegmentStatusRequest): Promise<GetManualSegmentStatusResponse | null> {
  const [periods, segment] = await Promise.all([
    getPeriodsByComputedPropertyId({
      workspaceId,
      step: ComputedPropertyStepEnum.ProcessAssignments,
      computedPropertyId: segmentId,
      computedPropertyType: "Segment",
    }),
    db().query.segment.findFirst({
      where: and(
        eq(schema.segment.workspaceId, workspaceId),
        eq(schema.segment.id, segmentId),
      ),
    }),
  ]);
  if (!segment) {
    return null;
  }
  const version = segment.definitionUpdatedAt.toString();
  const period = periods.get({
    computedPropertyId: segment.id,
    version,
  });
  return {
    lastComputedAt: period?.maxTo.toISOString() ?? null,
  };
}
