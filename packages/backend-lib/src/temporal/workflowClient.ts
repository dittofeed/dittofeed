import { WorkflowClient } from "@temporalio/client";

import config from "../config";

const client = new WorkflowClient({
  namespace: config().temporalNamespace,
});

export default client;
