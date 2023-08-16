import connectWorkflowClient from "../../temporal/connectWorkflowClient";
import {
  generateId,
  hubspotWorkflow,
  hubspotWorkflowInitialize,
} from "../hubspotWorkflow";

export async function startHubspotIntegrationWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const workflowClient = await connectWorkflowClient();

  await workflowClient.signalWithStart<typeof hubspotWorkflow>(
    hubspotWorkflow,
    {
      taskQueue: "default",
      workflowId: generateId(workspaceId),
      args: [{ workspaceId, shouldContinueAsNew: true }],
      signal: hubspotWorkflowInitialize,
      signalArgs: [],
    }
  );
}
