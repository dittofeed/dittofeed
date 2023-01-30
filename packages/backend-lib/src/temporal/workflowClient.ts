// import { WorkflowClient, Connection } from "@temporalio/client";
import { WorkflowClient } from "@temporalio/client";

import config from "../config";

// FIXME await client and connect in async
// const connection =

const client = new WorkflowClient({
  namespace: config().temporalNamespace,
});

export default client;
