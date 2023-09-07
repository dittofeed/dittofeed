import { type initOpenTelemetry } from "backend-lib/src/openTelemetry";
import { FastifyRequest } from "fastify";

import { getWorkspaceIdFromReq } from "./workspace";

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
};
export default telemetryConfig;
