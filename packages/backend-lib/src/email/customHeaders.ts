import { JSONValue } from "../types";

export interface CustomEmailHeader {
  name: string;
  value: string;
}

/**
 * Parses custom headers from the message template definition.
 * Headers are stored as an array of {name, value} objects.
 */
export function parseCustomHeaders(
  headers: unknown
): CustomEmailHeader[] {
  if (!headers || !Array.isArray(headers)) {
    return [];
  }
  return headers.filter(
    (h): h is CustomEmailHeader =>
      typeof h === "object" &&
      h !== null &&
      typeof h.name === "string" &&
      typeof h.value === "string" &&
      h.name.length > 0
  );
}

/**
 * Converts custom headers array to a plain object map
 * suitable for SMTP transports (nodemailer)
 */
export function headersToMap(
  headers: CustomEmailHeader[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const header of headers) {
    map[header.name] = header.value;
  }
  return map;
}

/**
 * Converts custom headers to Postmark-compatible format.
 * Postmark expects headers as an array of { Name, Value } objects.
 */
export function headersToPostmarkFormat(
  headers: CustomEmailHeader[]
): Array<{ Name: string; Value: string }> {
  return headers.map((h) => ({ Name: h.name, Value: h.value }));
}

/**
 * Converts custom headers to SendGrid-compatible format.
 * SendGrid expects headers as a plain object.
 */
export function headersToSendGridFormat(
  headers: CustomEmailHeader[]
): Record<string, string> {
  return headersToMap(headers);
}

/**
 * Converts custom headers to Amazon SES-compatible format.
 */
export function headersToSESFormat(
  headers: CustomEmailHeader[]
): Array<{ Name: string; Value: string }> {
  return headers.map((h) => ({ Name: h.name, Value: h.value }));
}

/**
 * Validates header names to prevent injection attacks.
 * RFC 2822 compliant header names only.
 */
export function validateHeaderName(name: string): boolean {
  // Header names must be printable ASCII characters except colon
  return /^[\x21-\x39\x3B-\x7E]+$/.test(name);
}

/**
 * Validates header values to prevent injection attacks.
 * No bare CR or LF characters allowed.
 */
export function validateHeaderValue(value: string): boolean {
  // No bare CR/LF (prevents header injection)
  return !/[\r\n]/.test(value);
}

/**
 * Validates all custom headers and returns only valid ones.
 * Logs warnings for invalid headers.
 */
export function sanitizeHeaders(
  headers: CustomEmailHeader[]
): CustomEmailHeader[] {
  return headers.filter((h) => {
    if (!validateHeaderName(h.name)) {
      console.warn(
        `Invalid email header name rejected: "${h.name}"`
      );
      return false;
    }
    if (!validateHeaderValue(h.value)) {
      console.warn(
        `Invalid email header value rejected for header: "${h.name}"`
      );
      return false;
    }
    return true;
  });
}

/**
 * Renders template variables within header values.
 * Supports simple {{variable}} substitution.
 */
export function renderHeaderValues(
  headers: CustomEmailHeader[],
  variables: Record<string, string>
): CustomEmailHeader[] {
  return headers.map((h) => ({
    name: h.name,
    value: h.value.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return variables[key] ?? "";
    }),
  }));
}
