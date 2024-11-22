import { AxiosRequestConfig } from "axios";

function escapeShell(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

function formatCurl(config: AxiosRequestConfig): string {
  const { method = "GET", url, headers = {}, data } = config;
  const parts: string[] = [`curl --request ${method.toUpperCase()}`];

  // Add URL
  if (url) {
    parts.push(`  --url ${escapeShell(url)}`);
  }

  // Add headers
  Object.entries(headers).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      parts.push(`  --header ${escapeShell(`${key}: ${value}`)}`);
    }
  });

  // Add data if present
  if (data) {
    const dataStr =
      typeof data === "string" ? data : JSON.stringify(data, null, 2);
    parts.push(`  --data ${escapeShell(dataStr)}`);
  }

  return parts.join(" \\\n");
}

export default formatCurl;
