import { EmailHeaders } from './emailHeaders';

/**
 * Extended email message definition that includes custom headers.
 * This extends the existing MessageEmailDefinition in Dittofeed.
 */
export interface EmailMessageDefinitionHeaders {
  /** Custom email headers to include when sending */
  headers?: EmailHeaders;
}

/**
 * Represents the full shape of an email channel message definition
 * with headers support added.
 */
export interface EmailTemplateDefinitionWithHeaders {
  from: string;
  subject: string;
  body: string;
  replyTo?: string;
  headers?: EmailHeaders;
}
