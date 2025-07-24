import config from "backend-lib/src/config";
import { NodeEnvEnum } from "backend-lib/src/types";

/**
 * Should only be called from server-side code.
 * @returns
 */
export function apiBase(): string {
  if (process.env.DASHBOARD_API_BASE !== undefined) {
    return process.env.DASHBOARD_API_BASE;
  }

  const fromName =
    process.env.DASHBOARD_API_NAME &&
    process.env[process.env.DASHBOARD_API_NAME];

  if (fromName !== undefined) {
    return fromName;
  }
  if (process.env.DASHBOARD_API_DOMAIN) {
    const domainParts = [process.env.DASHBOARD_API_DOMAIN];

    if (process.env.DASHBOARD_API_SUBDOMAIN) {
      domainParts.unshift(process.env.DASHBOARD_API_SUBDOMAIN);
    }
    const domain = domainParts.join(".");
    const protocol = process.env.DASHBOARD_API_PROTOCOL ?? "https";
    const port = process.env.DASHBOARD_API_PORT ?? "3001";
    const base = `${protocol}://${domain}:${port}`;
    return base;
  }

  if (config().authMode === "single-tenant") {
    return config().dashboardUrl;
  }
  if (config().nodeEnv === NodeEnvEnum.Development) {
    return "http://localhost:3001";
  }
  return "";
}
