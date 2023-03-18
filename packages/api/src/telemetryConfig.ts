import backendConfig from "backend-lib/src/config";
import { type initOpenTelemetry } from "backend-lib/src/openTelemetry";

const telemetryConfig: Parameters<
  typeof initOpenTelemetry
>[0]["configOverrides"] = {
  "@opentelemetry/instrumentation-fastify": {
    requestHook: (span, info) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const headers = info.request.headers as Record<string, string>;
      const workspaceId =
        headers["df-workspace-id"] ?? backendConfig().defaultWorkspaceId;

      span.setAttribute("workflowId", workspaceId);
    },
  },
};
export default telemetryConfig;
