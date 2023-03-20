import api from "@opentelemetry/api";
import {
  getNodeAutoInstrumentations,
  InstrumentationConfigMap,
} from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

import config from "./config";

export interface OpenTelemetry {
  sdk: NodeSDK;
  resource: Resource;
  traceExporter: OTLPTraceExporter;
  start: () => Promise<void>;
}

export function initOpenTelemetry({
  serviceName,
  configOverrides,
}: {
  serviceName: string;
  configOverrides?: InstrumentationConfigMap;
}): OpenTelemetry {
  const { otelCollector, startOtel } = config();
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
  });
  const traceExporter = new OTLPTraceExporter({
    url: otelCollector,
  });

  const sdk = new NodeSDK({
    resource,
    instrumentations: [getNodeAutoInstrumentations(configOverrides)],
    traceExporter,
  });

  const start = async function start() {
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

  return {
    start,
    sdk,
    resource,
    traceExporter,
  };
}
