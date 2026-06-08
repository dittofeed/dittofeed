/**
 * Email sending integration that demonstrates how custom headers
 * are passed to various email providers.
 *
 * This file shows the integration points for custom headers with
 * SMTP, Postmark, SendGrid, and Amazon SES providers.
 */

import { EmailHeaders } from 'isomorphic-lib/src/types/emailHeaders';
import { processEmailHeaders } from './emailHeaders';

// ============================================================
// SMTP Provider Integration (using nodemailer)
// ============================================================
export interface SmtpEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  headers?: EmailHeaders;
}

export function buildSmtpMessage(params: SmtpEmailParams) {
  const processedHeaders = processEmailHeaders(params.headers);

  return {
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
    // nodemailer accepts headers as an object
    headers: processedHeaders,
  };
}

// ============================================================
// Postmark Provider Integration
// ============================================================
export interface PostmarkEmailParams {
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  replyTo?: string;
  headers?: EmailHeaders;
  messageStream?: string;
}

export function buildPostmarkMessage(params: PostmarkEmailParams) {
  const processedHeaders = processEmailHeaders(params.headers);

  // Postmark uses Headers array format
  const postmarkHeaders = processedHeaders
    ? Object.entries(processedHeaders).map(([Name, Value]) => ({ Name, Value }))
    : undefined;

  const message: Record<string, unknown> = {
    From: params.from,
    To: params.to,
    Subject: params.subject,
    HtmlBody: params.htmlBody,
    ReplyTo: params.replyTo,
    Headers: postmarkHeaders,
  };

  // X-PM-Message-Stream can also be set via the MessageStream field
  if (params.messageStream) {
    message.MessageStream = params.messageStream;
  } else if (processedHeaders?.['X-PM-Message-Stream']) {
    message.MessageStream = processedHeaders['X-PM-Message-Stream'];
  }

  return message;
}

// ============================================================
// SendGrid Provider Integration
// ============================================================
export interface SendGridEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  headers?: EmailHeaders;
}

export function buildSendGridMessage(params: SendGridEmailParams) {
  const processedHeaders = processEmailHeaders(params.headers);

  return {
    from: { email: params.from },
    personalizations: [
      {
        to: [{ email: params.to }],
        // SendGrid accepts headers in personalizations
        headers: processedHeaders,
      },
    ],
    subject: params.subject,
    content: [{ type: 'text/html', value: params.html }],
    reply_to: params.replyTo ? { email: params.replyTo } : undefined,
    headers: processedHeaders,
  };
}

// ============================================================
// Amazon SES Provider Integration
// ============================================================
export interface SesEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  headers?: EmailHeaders;
}

export function buildSesRawMessage(params: SesEmailParams): string {
  const processedHeaders = processEmailHeaders(params.headers);
  const boundary = `----=_Part_${Date.now()}`;

  let rawMessage = '';
  rawMessage += `From: ${params.from}\r\n`;
  rawMessage += `To: ${params.to}\r\n`;
  rawMessage += `Subject: ${params.subject}\r\n`;

  if (params.replyTo) {
    rawMessage += `Reply-To: ${params.replyTo}\r\n`;
  }

  // Add custom headers
  if (processedHeaders) {
    for (const [key, value] of Object.entries(processedHeaders)) {
      rawMessage += `${key}: ${value}\r\n`;
    }
  }

  rawMessage += `MIME-Version: 1.0\r\n`;
  rawMessage += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
  rawMessage += `\r\n`;
  rawMessage += `--${boundary}\r\n`;
  rawMessage += `Content-Type: text/html; charset=UTF-8\r\n`;
  rawMessage += `\r\n`;
  rawMessage += `${params.html}\r\n`;
  rawMessage += `--${boundary}--\r\n`;

  return rawMessage;
}
