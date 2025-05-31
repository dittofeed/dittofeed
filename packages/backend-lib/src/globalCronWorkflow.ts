import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "./temporal/activities";

const { emitGlobalSignals, expireCache } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export const GLOBAL_CRON_ID = "global-cron-workflow";

export async function globalCronWorkflow() {
  await expireCache({ now: Date.now() });
  await emitGlobalSignals();
}
