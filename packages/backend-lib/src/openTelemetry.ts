import {
  getNodeAutoInstrumentations,
  InstrumentationConfigMap,
} from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

import config from "./config";

export function initOpenTelemetry({
  serviceName,
  configOverrides,
}: {
  serviceName: string;
  configOverrides?: InstrumentationConfigMap;
}) {
  const { otelCollector, startOtel } = config();

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    instrumentations: [getNodeAutoInstrumentations(configOverrides)],
    traceExporter: new OTLPTraceExporter({
      url: otelCollector,
    }),
  });

  return async function startOpentelemetry() {
    if (!startOtel) {
      return;
    }
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
  };
}
