import api, { Span, SpanStatusCode, trace } from "@opentelemetry/api";
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
// import logger from "./logger";
import { getServiceName, setServiceName } from "./openTelemetry/constants";

export interface OpenTelemetry {
  sdk: NodeSDK;
  resource: Resource;
  traceExporter: OTLPTraceExporter;
  start: () => void;
}

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
  return api.metrics.getMeterProvider().getMeter(getServiceName());
}

export function initOpenTelemetry({
  serviceName,
  configOverrides,
  meterProviderViews,
}: {
  serviceName: string;
  configOverrides?: InstrumentationConfigMap;
  meterProviderViews?: MeterProviderOptions["views"];
}): OpenTelemetry {
  setServiceName(serviceName);
  const { otelCollector, startOtel, appVersion, metricsExportIntervalMs } =
    config();

  // Ensure postgres queries are traced by default
  const defaultInstrumentationOverrides: InstrumentationConfigMap = {
    "@opentelemetry/instrumentation-pg": {
      enabled: true,
      // Capture DB spans even if a parent was not explicitly created
      requireParentSpan: false,
      enhancedDatabaseReporting: false,
      addSqlCommenterCommentToQueries: false,
    },
  };

  const mergedInstrumentationOverrides: InstrumentationConfigMap = {
    ...defaultInstrumentationOverrides,
    ...(configOverrides ?? {}),
  };

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    "service.version": appVersion,
  });

  const traceExporter = new OTLPTraceExporter({
    url: otelCollector,
  });
  const metricExporter = new OTLPMetricExporter({
    url: otelCollector,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exportIntervalMillis: metricsExportIntervalMs,
    exporter: metricExporter,
  });

  const sdk = new NodeSDK({
    resource,
    instrumentations: [
      getNodeAutoInstrumentations(mergedInstrumentationOverrides),
    ],
    traceExporter,
    metricReader,
  });

  sdk.configureMeterProvider({
    views: meterProviderViews,
  });

  const meter = getMeter();
  const rssGauge = meter.createObservableGauge("process.memory.rss", {
    description: "Process RSS memory usage",
    unit: "bytes",
  });
  const heapGauge = meter.createObservableGauge("process.memory.heap_used", {
    description: "Process heap memory usage",
    unit: "bytes",
  });
  meter.addBatchObservableCallback(
    (observer) => {
      const memoryUsage = process.memoryUsage();
      observer.observe(rssGauge, memoryUsage.rss);
      observer.observe(heapGauge, memoryUsage.heapUsed);
    },
    [rssGauge, heapGauge],
  );

  const start = function start() {
    if (!startOtel) {
      return;
    }

    [
      // Graceful shutdown
      "SIGTERM",
      "SIGINT",
    ].forEach((signal) =>
      process.on(signal, () => {
        sdk.shutdown().then(
          () => {
            console.log("Telemetry terminated");
            process.exit(0);
          },
          (err) => {
            console.error("Error terminating telemetry", err);
            process.exit(1);
          },
        );
      }),
    );

    try {
      sdk.start();
    } catch (err) {
      console.error("Error initializing telemetry", err);
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

export function withSpanSync<T>(
  {
    name,
    tracer: tracerName = "default",
  }: {
    name: string;
    tracer?: string;
  },
  cb: (span: Span) => T,
): T {
  const tracer = trace.getTracer(tracerName);
  return tracer.startActiveSpan(name, (span) => {
    try {
      return cb(span);
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
