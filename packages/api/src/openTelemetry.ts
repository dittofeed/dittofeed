import {
  ExplicitBucketHistogramAggregation,
  InstrumentType,
  View,
} from "@opentelemetry/sdk-metrics";
import backendConfig from "backend-lib/src/config";
import { initOpenTelemetry } from "backend-lib/src/openTelemetry";
import { FastifyRequest } from "fastify";

import config from "./config";
import { getWorkspaceIdFromReq } from "./workspace";

const apiConfig = config();
const { apiServiceName: serviceName } = apiConfig;

export const API_TELEMETRY_CONFIG: Parameters<
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
      const workspaceId = getWorkspaceIdFromReq(request).unwrapOr(null);
      span.updateName("api-custom-request-hook");
      if (workspaceId) {
        span.setAttribute("workspaceId", workspaceId);
      }
      const { appVersion } = backendConfig();
      if (appVersion) {
        span.setAttribute("service.version", appVersion);
      }
    },
  },
  "@opentelemetry/instrumentation-pino": {
    enabled: true,
  },
};

export const API_VIEWS = [
  new View({
    aggregation: new ExplicitBucketHistogramAggregation([200, 300, 400, 500]),
    instrumentName: "api-statuses",
    instrumentType: InstrumentType.HISTOGRAM,
  }),
];

export function initApiOpenTelemetry() {
  return initOpenTelemetry({
    serviceName,
    configOverrides: API_TELEMETRY_CONFIG,
    meterProviderViews: API_VIEWS,
  });
}
