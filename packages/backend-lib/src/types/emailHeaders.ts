/**
 * Type definitions for custom email headers.
 * These extend the existing message template types in Dittofeed.
 */

import * as t from "io-ts";

/**
 * io-ts codec for a single custom email header
 */
export const CustomEmailHeaderCodec = t.type({
  name: t.string,
  value: t.string,
});

/**
 * io-ts codec for an array of custom email headers
 */
export const CustomEmailHeadersCodec = t.array(CustomEmailHeaderCodec);

/**
 * TypeScript type for a custom email header
 */
export type CustomEmailHeaderType = t.TypeOf<typeof CustomEmailHeaderCodec>;

/**
 * TypeScript type for array of custom email headers
 */
export type CustomEmailHeadersType = t.TypeOf<typeof CustomEmailHeadersCodec>;

/**
 * Extension to the existing EmailMessageDefinition.
 * Add this field to the existing type:
 * 
 * ```typescript
 * const EmailMessageDefinition = t.intersection([
 *   t.type({
 *     from: t.string,
 *     subject: t.string,
 *     body: t.string,
 *   }),
 *   t.partial({
 *     replyTo: t.string,
 *     headers: CustomEmailHeadersCodec,  // <-- Add this
 *   }),
 * ]);
 * ```
 */
export const EmailMessageHeadersExtension = t.partial({
  headers: CustomEmailHeadersCodec,
});
