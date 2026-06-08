/**
 * Integration example showing how to wire custom headers into
 * Dittofeed's existing email template and sending infrastructure.
 *
 * This demonstrates the changes needed in the existing codebase.
 */

import { EmailHeaders } from '@dittofeed/isomorphic-lib/src/types/emailHeaders';
import {
  formatHeadersForPostmark,
  formatHeadersForSendGrid,
  formatHeadersForSmtp,
  formatHeadersForSes,
} from './customHeaders';

/**
 * STEP 1: Update the MessageTemplate type (in existing types file)
 *
 * Add 'headers' field to the email message definition:
 *
 * interface EmailMessageTemplateDefinition {
 *   from: string;
 *   subject: string;
 *   body: string;
 *   replyTo?: string;
 *   headers?: Array<{ name: string; value: string }>; // <-- ADD THIS
 * }
 */

/**
 * STEP 2: Update email provider integrations
 *
 * In the file that calls the email provider SDK, include headers:
 */

// Example: Postmark integration
interface PostmarkEmailPayload {
  From: string;
  To: string;
  Subject: string;
  HtmlBody: string;
  TextBody?: string;
  ReplyTo?: string;
  MessageStream?: string;
  Headers?: Array<{ Name: string; Value: string }>;
}

export function buildPostmarkPayload(
  from: string,
  to: string,
  subject: string,
  htmlBody: string,
  textBody?: string,
  replyTo?: string,
  headers?: EmailHeaders
): PostmarkEmailPayload {
  const customHeaders = formatHeadersForPostmark(headers);

  // Extract X-PM-Message-Stream into its dedicated field if present
  let messageStream: string | undefined;
  const filteredHeaders = customHeaders?.filter((h) => {
    if (h.Name === 'X-PM-Message-Stream') {
      messageStream = h.Value;
      return false;
    }
    return true;
  });

  return {
    From: from,
    To: to,
    Subject: subject,
    HtmlBody: htmlBody,
    ...(textBody && { TextBody: textBody }),
    ...(replyTo && { ReplyTo: replyTo }),
    ...(messageStream && { MessageStream: messageStream }),
    ...(filteredHeaders && filteredHeaders.length > 0 && { Headers: filteredHeaders }),
  };
}

// Example: SMTP integration (nodemailer)
export function buildSmtpPayload(
  from: string,
  to: string,
  subject: string,
  html: string,
  text?: string,
  replyTo?: string,
  headers?: EmailHeaders
) {
  const customHeaders = formatHeadersForSmtp(headers);

  return {
    from,
    to,
    subject,
    html,
    ...(text && { text }),
    ...(replyTo && { replyTo }),
    ...(customHeaders && { headers: customHeaders }),
  };
}

/**
 * STEP 3: Update the Dashboard email editor
 *
 * Import EmailCustomHeaders component and add it to the email editor form.
 * Store headers in the message template definition alongside subject, body, etc.
 *
 * Example in EmailEditor component:
 *
 * import { EmailCustomHeaders } from './EmailCustomHeaders';
 *
 * // In the form:
 * <EmailCustomHeaders
 *   headers={definition.headers ?? []}
 *   onChange={(headers) => updateDefinition({ ...definition, headers })}
 * />
 */
