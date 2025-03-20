import {
  ExplicitBucketHistogramAggregation,
  View,
} from "@opentelemetry/sdk-metrics";
import { initOpenTelemetry } from "backend-lib/src/openTelemetry";

import config from "./config";

export const WORKER_VIEWS = [
  new View({
    aggregation: new ExplicitBucketHistogramAggregation([
      500, 1000, 1500, 5000, 10000, 15000, 30000, 45000, 60000, 90000,
    ]),
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
