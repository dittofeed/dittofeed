import { WorkflowClient } from "@temporalio/client";

import config from "../config";
import connect from "./connection";

let CLIENT: WorkflowClient | null = null;

export default async function connectWorkflowClient(): Promise<WorkflowClient> {
  if (!CLIENT) {
    const connection = await connect();
    CLIENT = new WorkflowClient({
      connection,
      namespace: config().temporalNamespace,
    });
    return CLIENT;
  }

  return CLIENT;
}
