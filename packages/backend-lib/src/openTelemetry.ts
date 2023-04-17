import api, { Meter } from "@opentelemetry/api";
import {
  getNodeAutoInstrumentations,
  InstrumentationConfigMap,
} from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import {
  ConsoleMetricExporter,
  MeterProvider,
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
  start: () => Promise<void>;
}

// let METER_PROVIDER: MeterProvider | null = null;

// export function getMeterProvider() {
//   if (!METER_PROVIDER) {
//     throw new Error("Must init opentelemetry before accessing meter provider");
//   }
//   return METER_PROVIDER;
// }

let METER: Meter | null = null;

export function getMeter() {
  if (!METER) {
    throw new Error("Must init opentelemetry before accessing meter");
  }
  return METER;
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
  const { otelCollector, startOtel } = config();
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
  });

  const traceExporter = new OTLPTraceExporter({
    url: otelCollector,
  });
  const metricExporter = new ConsoleMetricExporter({});
  // const metricExporter = new OTLPMetricExporter({
  //   url: otelCollector,
  // });
  // METER_PROVIDER = new MeterProvider({
  //   views: meterProviderViews,
  // });
  // METER = METER_PROVIDER.getMeter(serviceName);

  const metricReader = new PeriodicExportingMetricReader({
    exportIntervalMillis: 10_000,
    exporter: metricExporter,
  });

  // METER_PROVIDER.addMetricReader(metricReader);

  const sdk = new NodeSDK({
    resource,
    instrumentations: [getNodeAutoInstrumentations(configOverrides)],
    traceExporter,
    metricReader,
  });

  sdk.configureMeterProvider({
    views: meterProviderViews,
  });

  // [03:45:28 UTC] ERROR: Error initializing telemetry
  //     err: {
  //       "type": "Error",
  //       "message": "MetricReader can not be bound to a MeterProvider again.",
  //       "stack":
  //           Error: MetricReader can not be bound to a MeterProvider again.
  //               at PeriodicExportingMetricReader.setMetricProducer (/Users/maxwellgurewitz/dev/dittofeed/node_modules/@opentelemetry/sdk-metrics/build/src/export/MetricReader.js:44:19)
  //               at MeterProvider.addMetricReader (/Users/maxwellgurewitz/dev/dittofeed/node_modules/@opentelemetry/sdk-metrics/build/src/MeterProvider.js:61:22)
  //               at NodeSDK.start (/Users/maxwellgurewitz/dev/dittofeed/node_modules/@opentelemetry/sdk-node/build/src/sdk.js:171:31)
  //               at Object.<anonymous> (/Users/maxwellgurewitz/dev/dittofeed/packages/backend-lib/dist/src/openTelemetry.js:121:50)
  //               at step (/Users/maxwellgurewitz/dev/dittofeed/packages/backend-lib/dist/src/openTelemetry.js:33:23)
  //               at Object.next (/Users/maxwellgurewitz/dev/dittofeed/packages/backend-lib/dist/src/openTelemetry.js:14:53)
  //               at /Users/maxwellgurewitz/dev/dittofeed/packages/backend-lib/dist/src/openTelemetry.js:8:71
  //               at new Promise (<anonymous>)
  //               at __awaiter (/Users/maxwellgurewitz/dev/dittofeed/packages/backend-lib/dist/src/openTelemetry.js:4:12)
  //               at Object.start (/Users/maxwellgurewitz/dev/dittofeed/packages/backend-lib/dist/src/openTelemetry.js:98:16)

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
