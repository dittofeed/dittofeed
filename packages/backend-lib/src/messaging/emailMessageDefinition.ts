/**
 * Extended email message definition type that includes custom headers.
 * This should be merged with the existing EmailMessageDefinition in the codebase.
 * 
 * Usage in the existing message definition:
 * 
 * Add to the existing Zod schema for email message definitions:
 * 
 * ```typescript
 * import { CustomEmailHeadersSchema } from "@dittofeed/isomorphic-lib/src/emailHeaders";
 * 
 * // Add to existing email message definition schema:
 * const EmailMessageDefinitionSchema = z.object({
 *   // ... existing fields (from, subject, body, replyTo, etc.)
 *   headers: CustomEmailHeadersSchema.optional().default([]),
 * });
 * ```
 */

import { z } from "zod";
import { CustomEmailHeadersSchema } from "@dittofeed/isomorphic-lib/src/emailHeaders";

/**
 * Schema extension for email message definitions.
 * This adds the `headers` field to the existing email template definition.
 */
export const EmailHeadersExtensionSchema = z.object({
  headers: CustomEmailHeadersSchema.optional().default([]),
});

export type EmailHeadersExtension = z.infer<typeof EmailHeadersExtensionSchema>;
