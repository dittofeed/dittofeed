import {
  ExplicitBucketHistogramAggregation,
  InstrumentType,
  View,
} from "@opentelemetry/sdk-metrics";
import { initOpenTelemetry } from "backend-lib/src/openTelemetry";
import { FastifyRequest } from "fastify";

import config from "./config";
import { getWorkspaceIdFromReq } from "./workspace";

const apiConfig = config();
const { apiServiceName: serviceName } = apiConfig;

const telemetryConfig: Parameters<
  typeof initOpenTelemetry
>[0]["configOverrides"] = {
  "@opentelemetry/instrumentation-http": {
    ignoreIncomingPaths: ["/api"],
  },
  "@opentelemetry/instrumentation-fs": {
    enabled: false,
  },
  "@opentelemetry/instrumentation-fastify": {
    requestHook: (span, info) => {
      const request = info.request as FastifyRequest;
      const workspaceId = getWorkspaceIdFromReq(request);
      if (workspaceId) {
        span.updateName("api-custom-request-hook");
        span.setAttribute("workspaceId", workspaceId);
      }
    },
  },
  "@opentelemetry/instrumentation-pino": {
    enabled: true,
  },
};

export function initApiOpenTelemetry() {
  return initOpenTelemetry({
    serviceName,
    configOverrides: telemetryConfig,
    meterProviderViews: [
      new View({
        aggregation: new ExplicitBucketHistogramAggregation([
          200, 300, 400, 500,
        ]),
        instrumentName: "api-statuses",
        instrumentType: InstrumentType.HISTOGRAM,
      }),
    ],
  });
}
