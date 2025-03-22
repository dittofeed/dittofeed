import { API_VIEWS } from "api/src/openTelemetry";
import { initOpenTelemetry } from "backend-lib/src/openTelemetry";
import { WORKER_VIEWS } from "worker/src/openTelemetry";

import config from "./config";

export function initLiteOpenTelemetry() {
  const liteConfig = config();
  const otel = initOpenTelemetry({
    serviceName: liteConfig.serviceName,
    meterProviderViews: [...API_VIEWS, ...WORKER_VIEWS],
  });
  return otel;
}
