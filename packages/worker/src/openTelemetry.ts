import {
  ExplicitBucketHistogramAggregation,
  InstrumentType,
  LastValueAggregation,
  View,
} from "@opentelemetry/sdk-metrics";
import {
  WORKFLOW_HISTORY_LENGTH_METRIC,
  WORKFLOW_HISTORY_SIZE_METRIC,
  WORKSPACE_COMPUTE_LATENCY_METRIC,
} from "backend-lib/src/constants";
import { initOpenTelemetry } from "backend-lib/src/openTelemetry";

import config from "./config";

export const WORKER_VIEWS = [
  new View({
    aggregation: new LastValueAggregation(),
    instrumentName: WORKSPACE_COMPUTE_LATENCY_METRIC,
    instrumentType: InstrumentType.HISTOGRAM,
    attributeKeys: ["workspaceId"],
  }),
  new View({
    aggregation: new ExplicitBucketHistogramAggregation([
      4096, 16384, 65536, 262144, 1048576, 4194304, 16777216, 67108864,
    ]),
    instrumentName: WORKFLOW_HISTORY_SIZE_METRIC,
    instrumentType: InstrumentType.HISTOGRAM,
  }),
  new View({
    aggregation: new ExplicitBucketHistogramAggregation([
      25, 100, 500, 2500, 10000, 50000,
    ]),
    instrumentName: WORKFLOW_HISTORY_LENGTH_METRIC,
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
