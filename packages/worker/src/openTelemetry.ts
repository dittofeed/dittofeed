import {
  ExplicitBucketHistogramAggregation,
  InstrumentType,
  View,
} from "@opentelemetry/sdk-metrics";
import { WORKSPACE_COMPUTE_LATENCY_METRIC } from "backend-lib/src/constants";
import { initOpenTelemetry } from "backend-lib/src/openTelemetry";

import config from "./config";

export const WORKER_VIEWS = [
  new View({
    aggregation: new ExplicitBucketHistogramAggregation([
      500, 1000, 1500, 5000, 10000, 15000, 30000, 45000, 60000, 90000, 120000,
      180000, 240000, 300000, 600000, 1800000, 3600000, 86400000, 604800000,
    ]),
    instrumentName: WORKSPACE_COMPUTE_LATENCY_METRIC,
    instrumentType: InstrumentType.HISTOGRAM,
  }),
];

export function initWorkerOpenTelemetry() {
  const workerConfig = config();
  const otel = initOpenTelemetry({
    serviceName: workerConfig.workerServiceName,
    meterProviderViews: WORKER_VIEWS,
  });
  return otel;
}
