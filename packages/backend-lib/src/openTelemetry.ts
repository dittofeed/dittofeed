import {
  getNodeAutoInstrumentations,
  InstrumentationConfigMap,
} from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

import config from "./config";
import logger from "./logger";

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
  const metricExporter = new OTLPMetricExporter({
    url: otelCollector,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exportIntervalMillis: 10_000,
    exporter: metricExporter,
  });

  const sdk = new NodeSDK({
    resource,
    instrumentations: [getNodeAutoInstrumentations(configOverrides)],
    traceExporter,
    metricReader,
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
            logger().info("Telemetry terminated");
            process.exit(0);
          },
          (err) => {
            logger().error({ err }, "Error terminating telemetry");
            process.exit(1);
          }
        );
      })
    );

    try {
      await sdk.start();
    } catch (err) {
      logger().error({ err }, "Error initializing telemetry");
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
