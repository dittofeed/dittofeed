import { API_TELEMETRY_CONFIG, API_VIEWS } from "api/src/openTelemetry";
import { initOpenTelemetry } from "backend-lib/src/openTelemetry";
import { WORKER_VIEWS } from "worker/src/openTelemetry";

import config from "./config";

export function initLiteOpenTelemetry() {
  const liteConfig = config();
  const meterProviderViews = liteConfig.enableWorker
    ? [...API_VIEWS, ...WORKER_VIEWS]
    : API_VIEWS;

  const otel = initOpenTelemetry({
    serviceName: liteConfig.serviceName,
    configOverrides: API_TELEMETRY_CONFIG,
    meterProviderViews,
  });
  return otel;
}
