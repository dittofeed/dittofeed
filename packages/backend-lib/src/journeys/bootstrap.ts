import { proxyActivities } from "@temporalio/workflow";

import * as activities from "./bootstrap/activities";

const { bootstrap } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
});

export async function bootstrapWorkflow(
  params: Parameters<typeof bootstrap>[0],
) {
  await bootstrap(params);
}
