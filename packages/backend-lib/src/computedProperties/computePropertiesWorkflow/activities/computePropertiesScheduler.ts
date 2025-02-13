import connectClient from "../../../temporal/client";
import {
  COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
  computePropertiesQueueWorkflow,
  getQueueSizeQuery,
} from "../../computePropertiesQueueWorkflow";
import { findDueWorkspaceMaxTos, FindDueWorkspacesParams } from "../../periods";

export async function findDueWorkspaces(
  params: FindDueWorkspacesParams,
): Promise<{ workspaceIds: string[] }> {
  const maxTos = await findDueWorkspaceMaxTos(params);
  return {
    workspaceIds: maxTos.map(({ workspaceId }) => workspaceId),
  };
}

export async function getQueueSize(): Promise<number> {
  const client = await connectClient();
  const handle = client.workflow.getHandle<
    typeof computePropertiesQueueWorkflow
  >(COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID);
  return handle.query(getQueueSizeQuery);
}
