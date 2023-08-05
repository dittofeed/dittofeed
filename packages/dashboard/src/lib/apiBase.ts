export function apiBase(): string {
  return process.env.DASHBOARD_API_BASE ?? "http://localhost:3001";
}
