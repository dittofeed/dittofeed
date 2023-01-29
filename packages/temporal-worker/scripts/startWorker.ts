import { NativeConnection,Worker } from "@temporalio/worker";
import * as activities from "backend-lib/src/temporal/activities";

import config from "../src/config";

async function run() {
  const connection = await NativeConnection.connect({
    address: config().temporalAddress,
  });
  const worker = await Worker.create({
    connection,
    namespace: "dittofeed",
    workflowsPath: require.resolve("backend-lib/src/temporal/workflows"),
    activities,
    taskQueue: "default",
  });
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
