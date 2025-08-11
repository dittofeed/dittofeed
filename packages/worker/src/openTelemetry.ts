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
  new View({
    aggregation: new ExplicitBucketHistogramAggregation([
      1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288,
      1048576, 2097152, 4194304, 8388608, 16777216, 33554432, 67108864,
    ]),
    instrumentName: "workflow_history_size_histogram",
    instrumentType: InstrumentType.HISTOGRAM,
  }),
  new View({
    aggregation: new ExplicitBucketHistogramAggregation([
      10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000,
    ]),
    instrumentName: "workflow_history_length_histogram",
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
