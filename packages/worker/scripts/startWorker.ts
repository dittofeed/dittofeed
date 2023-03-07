import {
  appendDefaultInterceptors,
  NativeConnection,
  Worker,
} from "@temporalio/worker";
import backendConfig from "backend-lib/src/config";
import * as activities from "backend-lib/src/temporal/activities";
import { CustomActivityInboundInterceptor } from "backend-lib/src/temporal/activityInboundInterceptor";
import connectWorkflowCLient from "backend-lib/src/temporal/connectWorkflowClient";

async function run() {
  const [connection, workflowClient] = await Promise.all([
    NativeConnection.connect({
      address: backendConfig().temporalAddress,
    }),
    connectWorkflowCLient(),
  ]);

  const worker = await Worker.create({
    connection,
    namespace: backendConfig().temporalNamespace,
    workflowsPath: require.resolve("backend-lib/src/temporal/workflows"),
    activities,
    taskQueue: "default",
    interceptors: appendDefaultInterceptors(
      {
        activityInbound: [
          (ctx) =>
            new CustomActivityInboundInterceptor(ctx, {
              workflowClient,
            }),
        ],
      },
      console
    ),
  });
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
