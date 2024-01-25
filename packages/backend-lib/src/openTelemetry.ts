import api, { Meter, Span, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  getNodeAutoInstrumentations,
  InstrumentationConfigMap,
} from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import {
  MeterProviderOptions,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

import config from "./config";
import logger from "./logger";

export interface OpenTelemetry {
  sdk: NodeSDK;
  resource: Resource;
  traceExporter: OTLPTraceExporter;
  start: () => void;
}

let METER: Meter | null = null;

export async function withSpan<T>(
  {
    name,
    tracer: tracerName = "default",
  }: {
    name: string;
    tracer?: string;
  },
  cb: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(tracerName);
  return tracer.startActiveSpan(name, async (span) => {
    try {
      return await cb(span);
    } catch (e) {
      if (e instanceof Error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: e.message,
        });
        span.recordException(e);
      }
      throw e;
    } finally {
      span.end();
    }
  });
}

export function getMeter() {
  if (!METER) {
    throw new Error("Must init opentelemetry before accessing meter");
  }
  return METER;
}
export function getSpan() {}

export function initOpenTelemetry({
  serviceName,
  configOverrides,
  meterProviderViews,
}: {
  serviceName: string;
  configOverrides?: InstrumentationConfigMap;
  meterProviderViews?: MeterProviderOptions["views"];
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

  sdk.configureMeterProvider({
    views: meterProviderViews,
  });

  const start = function start() {
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
            logger().error(
              { err: err as Error },
              "Error terminating telemetry",
            );
            process.exit(1);
          },
        );
      }),
    );

    try {
      sdk.start();
      METER = api.metrics.getMeterProvider().getMeter(serviceName);
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
