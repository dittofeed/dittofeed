import { z } from "zod";

/**
 * Schema for a single custom email header.
 */
export const EmailHeaderSchema = z.object({
  name: z.string().min(1).max(256).regex(
    /^[A-Za-z0-9\-]+$/,
    "Header name must contain only alphanumeric characters and hyphens"
  ),
  value: z.string().max(2048),
});

export type EmailHeader = z.infer<typeof EmailHeaderSchema>;

/**
 * Schema for an array of custom email headers.
 */
export const EmailHeadersSchema = z.array(EmailHeaderSchema).max(50).optional();

export type EmailHeaders = z.infer<typeof EmailHeadersSchema>;

/**
 * Convert EmailHeader[] to a plain Record<string, string> for providers.
 */
export function headersToRecord(
  headers?: EmailHeader[]
): Record<string, string> | undefined {
  if (!headers || headers.length === 0) return undefined;
  const record: Record<string, string> = {};
  for (const header of headers) {
    record[header.name] = header.value;
  }
  return record;
}

/**
 * Blocked headers that should not be customizable for security reasons.
 */
export const BLOCKED_HEADER_NAMES = new Set([
  "from",
  "to",
  "cc",
  "bcc",
  "subject",
  "date",
  "message-id",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
  "dkim-signature",
  "received",
  "return-path",
]);

/**
 * Validate that headers don't include blocked names.
 */
export function validateHeaders(headers?: EmailHeader[]): {
  valid: boolean;
  errors: string[];
} {
  if (!headers || headers.length === 0) return { valid: true, errors: [] };

  const errors: string[] = [];
  for (const header of headers) {
    if (BLOCKED_HEADER_NAMES.has(header.name.toLowerCase())) {
      errors.push(
        `Header "${header.name}" is not allowed as a custom header.`
      );
    }
  }
  return { valid: errors.length === 0, errors };
}
