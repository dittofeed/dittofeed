import { Connection, WorkflowClient } from "@temporalio/client";

import config from "../config";

let CLIENT: WorkflowClient | null = null;

export default async function connectWorkflowClient(): Promise<WorkflowClient> {
  if (!CLIENT) {
    const connection = await Connection.connect({
      address: config().temporalAddress,
    });
    CLIENT = new WorkflowClient({
      connection,
      namespace: config().temporalNamespace,
    });
    return CLIENT;
  }

  return CLIENT;
}
