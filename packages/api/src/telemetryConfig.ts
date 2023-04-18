import backendConfig from "backend-lib/src/config";
import { type initOpenTelemetry } from "backend-lib/src/openTelemetry";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";

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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const headers = info.request.headers as Record<string, string>;
      const workspaceId =
        headers[WORKSPACE_ID_HEADER] ?? backendConfig().defaultWorkspaceId;

      span.updateName("api-custom-request-hook");
      span.setAttribute("workflowId", workspaceId);
    },
  },
};
export default telemetryConfig;
