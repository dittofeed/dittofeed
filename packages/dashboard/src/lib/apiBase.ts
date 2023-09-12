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
  return "http://localhost:3001";
}
