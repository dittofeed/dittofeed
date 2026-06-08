import { z } from "zod";

/**
 * Schema for a single custom email header.
 * Header names must start with 'X-' to prevent overriding standard headers.
 */
export const CustomEmailHeaderSchema = z.object({
  name: z
    .string()
    .min(1, "Header name is required")
    .regex(
      /^X-[A-Za-z0-9-]+$/,
      "Header name must start with 'X-' and contain only alphanumeric characters and hyphens"
    ),
  value: z.string().min(1, "Header value is required"),
});

export const CustomEmailHeadersSchema = z.array(CustomEmailHeaderSchema).max(20, "Maximum 20 custom headers allowed");

export type CustomEmailHeader = z.infer<typeof CustomEmailHeaderSchema>;
export type CustomEmailHeaders = z.infer<typeof CustomEmailHeadersSchema>;

/**
 * Convert custom headers array to a Record<string, string> for use with email providers.
 */
export function headersArrayToRecord(
  headers: CustomEmailHeaders
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const header of headers) {
    record[header.name] = header.value;
  }
  return record;
}

/**
 * Convert a Record<string, string> back to the headers array format.
 */
export function headersRecordToArray(
  record: Record<string, string>
): CustomEmailHeaders {
  return Object.entries(record).map(([name, value]) => ({ name, value }));
}

/**
 * Validate and sanitize custom headers.
 * Returns only valid headers, filtering out any invalid ones.
 */
export function validateAndSanitizeHeaders(
  headers: unknown
): CustomEmailHeaders {
  const result = CustomEmailHeadersSchema.safeParse(headers);
  if (result.success) {
    return result.data;
  }
  return [];
}
