/**
 * Utilities for applying custom headers to various email provider payloads.
 * Supports: SMTP (nodemailer), SendGrid, Postmark, Amazon SES, Resend, Mailgun.
 */

import { EmailHeader, serializeHeaders } from "isomorphic-lib/src/emailHeaders";

export interface SmtpMailOptions {
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface SendGridPersonalization {
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface SendGridMailData {
  personalizations?: SendGridPersonalization[];
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface PostmarkMessage {
  Headers?: Array<{ Name: string; Value: string }>;
  MessageStream?: string;
  [key: string]: unknown;
}

export interface SesMessage {
  Headers?: Array<{ Name: string; Value: string }>;
  [key: string]: unknown;
}

export interface ResendMessage {
  headers?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Apply custom headers to a nodemailer SMTP mail options object.
 */
export function applyHeadersToSmtp(
  mailOptions: SmtpMailOptions,
  customHeaders: EmailHeader[]
): SmtpMailOptions {
  if (!customHeaders.length) return mailOptions;
  const headersMap = serializeHeaders(customHeaders);
  return {
    ...mailOptions,
    headers: {
      ...(mailOptions.headers || {}),
      ...headersMap,
    },
  };
}

/**
 * Apply custom headers to a SendGrid mail data object.
 */
export function applyHeadersToSendGrid(
  mailData: SendGridMailData,
  customHeaders: EmailHeader[]
): SendGridMailData {
  if (!customHeaders.length) return mailData;
  const headersMap = serializeHeaders(customHeaders);
  return {
    ...mailData,
    headers: {
      ...(mailData.headers || {}),
      ...headersMap,
    },
  };
}

/**
 * Apply custom headers to a Postmark message object.
 * Handles the special X-PM-Message-Stream header by setting the MessageStream field.
 */
export function applyHeadersToPostmark(
  message: PostmarkMessage,
  customHeaders: EmailHeader[]
): PostmarkMessage {
  if (!customHeaders.length) return message;

  const result = { ...message };
  const postmarkHeaders: Array<{ Name: string; Value: string }> = [
    ...(result.Headers || []),
  ];

  for (const header of customHeaders) {
    if (header.name.toLowerCase() === "x-pm-message-stream") {
      // Postmark uses a dedicated field for message stream
      result.MessageStream = header.value;
    } else {
      postmarkHeaders.push({ Name: header.name, Value: header.value });
    }
  }

  if (postmarkHeaders.length > 0) {
    result.Headers = postmarkHeaders;
  }

  return result;
}

/**
 * Apply custom headers to an Amazon SES message.
 */
export function applyHeadersToSes(
  message: SesMessage,
  customHeaders: EmailHeader[]
): SesMessage {
  if (!customHeaders.length) return message;
  return {
    ...message,
    Headers: [
      ...(message.Headers || []),
      ...customHeaders.map((h) => ({ Name: h.name, Value: h.value })),
    ],
  };
}

/**
 * Apply custom headers to a Resend message.
 */
export function applyHeadersToResend(
  message: ResendMessage,
  customHeaders: EmailHeader[]
): ResendMessage {
  if (!customHeaders.length) return message;
  const headersMap = serializeHeaders(customHeaders);
  return {
    ...message,
    headers: {
      ...(message.headers || {}),
      ...headersMap,
    },
  };
}
