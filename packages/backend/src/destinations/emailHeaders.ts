import { EmailHeaders } from 'isomorphic-lib/src/types/emailHeaders';

/**
 * Merges custom headers from template definition with any system headers.
 * System headers take precedence over user-defined headers to prevent
 * overriding critical email infrastructure headers.
 */
export function mergeEmailHeaders(
  customHeaders?: EmailHeaders,
  systemHeaders?: EmailHeaders
): EmailHeaders {
  const merged: EmailHeaders = {};

  if (customHeaders) {
    for (const [key, value] of Object.entries(customHeaders)) {
      merged[key] = value;
    }
  }

  if (systemHeaders) {
    for (const [key, value] of Object.entries(systemHeaders)) {
      merged[key] = value;
    }
  }

  return merged;
}

/**
 * Filters out any headers that should not be set by users.
 * These are headers controlled by the email infrastructure.
 */
const BLOCKED_HEADERS = new Set([
  'from',
  'to',
  'cc',
  'bcc',
  'subject',
  'date',
  'message-id',
  'mime-version',
  'content-type',
  'content-transfer-encoding',
  'dkim-signature',
  'received',
  'return-path',
]);

export function filterBlockedHeaders(headers: EmailHeaders): EmailHeaders {
  const filtered: EmailHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Processes headers for sending: filters blocked headers and merges with system headers.
 */
export function processEmailHeaders(
  customHeaders?: EmailHeaders,
  systemHeaders?: EmailHeaders
): EmailHeaders | undefined {
  const filtered = customHeaders ? filterBlockedHeaders(customHeaders) : undefined;
  const merged = mergeEmailHeaders(filtered, systemHeaders);
  return Object.keys(merged).length > 0 ? merged : undefined;
}
