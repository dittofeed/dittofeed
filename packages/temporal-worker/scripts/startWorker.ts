import { Worker } from "@temporalio/worker";
import * as activities from "backend-lib/src/temporal/activities";

async function run() {
  const worker = await Worker.create({
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
