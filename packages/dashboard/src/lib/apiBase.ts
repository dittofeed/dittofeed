import { hasProtocol } from "isomorphic-lib/src/urls";

export function apiBase(): string {
  if (!process.env.DASHBOARD_API_BASE) {
    return "http://localhost:3001";
  }
  if (!hasProtocol(process.env.DASHBOARD_API_BASE)) {
    return `https://${process.env.DASHBOARD_API_BASE}`;
  }
  return process.env.DASHBOARD_API_BASE;
}
