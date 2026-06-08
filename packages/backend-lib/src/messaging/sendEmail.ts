/**
 * Example integration showing how custom headers are passed to email providers.
 * This file demonstrates the pattern to be integrated into the existing
 * Dittofeed messaging pipeline.
 */

import { applyCustomHeaders, EmailProvider } from "../email/applyCustomHeaders";

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Custom headers defined in the message template */
  headers?: Array<{ name: string; value: string }>;
}

export interface SendEmailOptions {
  message: EmailMessage;
  provider: EmailProvider;
  templateVariables?: Record<string, string>;
}

/**
 * Demonstrates how to integrate custom headers into the email sending flow.
 * 
 * For SMTP (nodemailer):
 *   The headers are added to the `headers` field of the mail options.
 * 
 * For Postmark:
 *   The headers are added to the `Headers` field of the API request
 *   as an array of {Name, Value} objects. This includes X-PM-Message-Stream.
 * 
 * For SendGrid:
 *   The headers are added to the `headers` field of the personalization.
 * 
 * For Amazon SES:
 *   The headers are added via the `Headers` field in the raw message.
 * 
 * For Resend:
 *   The headers are added to the `headers` field of the API request.
 */
export function buildProviderPayload(options: SendEmailOptions) {
  const { message, provider, templateVariables = {} } = options;

  const headersResult = applyCustomHeaders({
    rawHeaders: message.headers,
    templateVariables,
    provider,
  });

  switch (provider) {
    case "smtp": {
      // Nodemailer format
      return {
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        replyTo: message.replyTo,
        headers: headersResult.headers,
      };
    }
    case "postmark": {
      // Postmark API format
      const payload: Record<string, unknown> = {
        From: message.from,
        To: message.to,
        Subject: message.subject,
        HtmlBody: message.html,
        ReplyTo: message.replyTo,
      };
      if (headersResult.provider === "postmark" && headersResult.headers.length > 0) {
        payload.Headers = headersResult.headers;
        // Special handling for X-PM-Message-Stream
        const streamHeader = headersResult.headers.find(
          (h) => h.Name === "X-PM-Message-Stream"
        );
        if (streamHeader) {
          payload.MessageStream = streamHeader.Value;
        }
      }
      return payload;
    }
    case "sendgrid": {
      // SendGrid API format
      return {
        personalizations: [
          {
            to: [{ email: message.to }],
            headers:
              headersResult.provider === "sendgrid"
                ? headersResult.headers
                : undefined,
          },
        ],
        from: { email: message.from },
        subject: message.subject,
        content: [{ type: "text/html", value: message.html }],
        reply_to: message.replyTo
          ? { email: message.replyTo }
          : undefined,
      };
    }
    case "ses": {
      // AWS SES format
      return {
        Source: message.from,
        Destination: { ToAddresses: [message.to] },
        Message: {
          Subject: { Data: message.subject },
          Body: { Html: { Data: message.html } },
        },
        ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
        // Headers need to be applied via raw email for SES
        CustomHeaders:
          headersResult.provider === "ses" ? headersResult.headers : undefined,
      };
    }
    case "resend": {
      // Resend API format
      return {
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        reply_to: message.replyTo,
        headers:
          headersResult.provider === "resend"
            ? headersResult.headers
            : undefined,
      };
    }
    default:
      return {
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
      };
  }
}
