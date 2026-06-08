/**
 * Extended type definitions showing how custom headers fit into
 * the existing MessageTemplate definition structure.
 *
 * In the actual codebase, the `headers` field would be added to
 * the existing EmailTemplateDefinition interface.
 */

import { CustomEmailHeader } from "../messaging/customHeaders";

/**
 * Represents the definition of an email message template.
 * The `headers` field is the new addition for custom header support.
 */
export interface EmailMessageTemplateDefinition {
  type: "Email";
  from: string;
  subject: string;
  body: string;
  replyTo?: string;
  /**
   * Custom email headers to include when sending.
   * Each header has a name and value.
   * Values support template variable substitution using {{variable}} syntax.
   *
   * Example:
   * [
   *   { name: "X-PM-Message-Stream", value: "broadcast" },
   *   { name: "X-Custom-Campaign", value: "{{campaignId}}" }
   * ]
   */
  headers?: CustomEmailHeader[];
}

/**
 * Union type for all message template definitions.
 * In practice this would include SMS, Push, etc.
 */
export type MessageTemplateDefinition =
  | EmailMessageTemplateDefinition;
