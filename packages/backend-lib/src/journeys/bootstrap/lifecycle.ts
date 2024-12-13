import { WorkflowClient } from "@temporalio/client";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";

import bootstrap, {
  BootstrapWithoutDefaultsParams,
  getBootstrapDefaultParams,
} from "../../bootstrap";
import connectWorkflowClient from "../../temporal/connectWorkflowClient";
import { bootstrapWorkflow } from "../bootstrap";

export function getBootstrapWorkflowId(
  params: Parameters<typeof bootstrap>[0],
) {
  return `bootstrap-${params.workspaceName}`;
}

export async function startBootstrapWorkflow(
  params: BootstrapWithoutDefaultsParams & {
    client?: WorkflowClient;
  },
) {
  const { client, ...paramsWithoutClientOrDefaults } = params;
  const paramsWithDefaults = getBootstrapDefaultParams(
    paramsWithoutClientOrDefaults,
  );
  const temporalClient = client ?? (await connectWorkflowClient());

  try {
    await temporalClient.start(bootstrapWorkflow, {
      workflowId: getBootstrapWorkflowId(paramsWithDefaults),
      args: [paramsWithDefaults],
      taskQueue: "default",
    });
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      return;
    }
    throw error;
  }
}
