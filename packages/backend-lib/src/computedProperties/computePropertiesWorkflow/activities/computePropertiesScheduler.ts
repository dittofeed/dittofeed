import connectClient from "../../../temporal/client";
import { WorkspaceQueueItem } from "../../../types";
import {
  COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
  computePropertiesQueueWorkflow,
  getQueueSizeQuery,
} from "../../computePropertiesQueueWorkflow";
import {
  findDueWorkspaceMaxTos,
  findDueWorkspaceMinTos,
  FindDueWorkspacesParams,
} from "../../periods";

export async function findDueWorkspaces(
  params: FindDueWorkspacesParams,
): Promise<{ workspaceIds: string[] }> {
  const maxTos = await findDueWorkspaceMaxTos(params);
  return {
    workspaceIds: maxTos.map(({ workspaceId }) => workspaceId),
  };
}

export interface DueWorkspace {
  id: string;
  maxPeriod?: number;
}

export async function findDueWorkspacesV2(
  params: FindDueWorkspacesParams,
): Promise<{ workspaces: DueWorkspace[] }> {
  const maxTos = await findDueWorkspaceMaxTos(params);
  return {
    workspaces: maxTos.map(({ workspaceId, max }) => ({
      id: workspaceId,
      maxPeriod: max?.getTime(),
    })),
  };
}

export async function getQueueSize(): Promise<number> {
  const client = await connectClient();
  const handle = client.workflow.getHandle<
    typeof computePropertiesQueueWorkflow
  >(COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID);
  return handle.query(getQueueSizeQuery);
}

export async function findDueWorkspacesV3(
  params: FindDueWorkspacesParams,
): Promise<{ workspaces: WorkspaceQueueItem[] }> {
  const minTos = await findDueWorkspaceMinTos(params);
  return {
    workspaces: minTos.map(({ workspaceId, min }) => ({
      id: workspaceId,
      maxPeriod: min?.getTime(),
    })),
  };
}
