import {
  InstrumentType,
  LastValueAggregation,
  View,
} from "@opentelemetry/sdk-metrics";
import { WORKSPACE_COMPUTE_LATENCY_METRIC } from "backend-lib/src/constants";
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
    aggregation: new LastValueAggregation(),
    instrumentName: "workflow_history_size_histogram",
    instrumentType: InstrumentType.HISTOGRAM,
  }),
  new View({
    aggregation: new LastValueAggregation(),
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
