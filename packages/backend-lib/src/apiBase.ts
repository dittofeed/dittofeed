import { NodeEnvEnum } from "./types";

export interface ResolveApiBaseParams {
  dashboardApiBase?: string;
  dashboardApiName?: string;
  dashboardApiDomain?: string;
  dashboardApiSubdomain?: string;
  dashboardApiProtocol?: string;
  dashboardApiPort?: string;
  authMode: string;
  dashboardUrl: string;
  nodeEnv: NodeEnvEnum;
}

/**
 * Resolves the API base URL based on configuration.
 * This is a pure function to enable easy testing.
 */
export function resolveApiBase(params: ResolveApiBaseParams): string {
  const {
    dashboardApiBase,
    dashboardApiName,
    dashboardApiDomain,
    dashboardApiSubdomain,
    dashboardApiProtocol,
    dashboardApiPort,
    authMode,
    dashboardUrl,
    nodeEnv,
  } = params;

  // 1. Direct API base URL takes precedence
  if (dashboardApiBase !== undefined) {
    return dashboardApiBase;
  }

  // 2. Named environment variable lookup
  if (dashboardApiName !== undefined) {
    return dashboardApiName;
  }

  // 3. Construct from domain parts
  if (dashboardApiDomain) {
    const domainParts = [dashboardApiDomain];

    if (dashboardApiSubdomain) {
      domainParts.unshift(dashboardApiSubdomain);
    }
    const domain = domainParts.join(".");
    const protocol = dashboardApiProtocol ?? "https";
    const port = dashboardApiPort ?? "3001";
    return `${protocol}://${domain}:${port}`;
  }

  // 4. Single-tenant mode uses dashboard URL
  if (authMode === "single-tenant") {
    return dashboardUrl;
  }

  // 5. Development mode defaults to localhost:3001
  if (nodeEnv === NodeEnvEnum.Development) {
    return "http://localhost:3001";
  }

  // 6. Default fallback
  return "";
}
