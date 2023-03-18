import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

import config from "./config";

export async function startOpentelemetry({
  serviceName,
}: {
  serviceName: string;
}) {
  const { otelCollector } = config();
  if (!otelCollector) {
    return;
  }

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
    traceExporter: new OTLPTraceExporter({
      url: otelCollector,
    }),
  });

  // Graceful shutdown
  ["SIGTERM", "SIGINT"].forEach((signal) =>
    process.on(signal, () => {
      sdk.shutdown().then(
        () => {
          console.log("Tracing terminated");
          process.exit(0);
        },
        (error) => {
          console.error("Error terminating tracing", error);
          process.exit(1);
        }
      );
    })
  );

  try {
    await sdk.start();
  } catch (error) {
    console.error("Error initializing tracing", error);
    process.exit(1);
  }
}
