/**
 * Utility module for applying custom email headers across different email providers.
 *
 * Supports:
 * - Postmark (Headers array with Name/Value objects)
 * - SendGrid (headers object)
 * - SMTP/Nodemailer (headers object)
 * - Amazon SES (Headers in raw message or via SDK)
 * - Resend (headers object)
 */

import {
  EmailHeaders,
  headersToObject,
  headersToPostmarkFormat,
  isValidHeaderName,
  isValidHeaderValue,
} from 'isomorphic-lib/src/types/emailHeaders';

export interface PostmarkMessageParams {
  Headers?: Array<{ Name: string; Value: string }>;
  [key: string]: unknown;
}

export interface SendGridMessageParams {
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface NodemailerMessageParams {
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface ResendMessageParams {
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface AmazonSESMessageParams {
  headers?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Applies custom headers to a Postmark message payload.
 */
export function applyHeadersToPostmark(
  message: PostmarkMessageParams,
  customHeaders?: EmailHeaders
): PostmarkMessageParams {
  if (!customHeaders || customHeaders.length === 0) {
    return message;
  }

  const existingHeaders = message.Headers || [];
  const newHeaders = headersToPostmarkFormat(customHeaders);

  return {
    ...message,
    Headers: [...existingHeaders, ...newHeaders],
  };
}

/**
 * Applies custom headers to a SendGrid message payload.
 */
export function applyHeadersToSendGrid(
  message: SendGridMessageParams,
  customHeaders?: EmailHeaders
): SendGridMessageParams {
  if (!customHeaders || customHeaders.length === 0) {
    return message;
  }

  const existingHeaders = message.headers || {};
  const newHeaders = headersToObject(customHeaders);

  return {
    ...message,
    headers: { ...existingHeaders, ...newHeaders },
  };
}

/**
 * Applies custom headers to a Nodemailer (SMTP) message payload.
 */
export function applyHeadersToNodemailer(
  message: NodemailerMessageParams,
  customHeaders?: EmailHeaders
): NodemailerMessageParams {
  if (!customHeaders || customHeaders.length === 0) {
    return message;
  }

  const existingHeaders = message.headers || {};
  const newHeaders = headersToObject(customHeaders);

  return {
    ...message,
    headers: { ...existingHeaders, ...newHeaders },
  };
}

/**
 * Applies custom headers to a Resend message payload.
 */
export function applyHeadersToResend(
  message: ResendMessageParams,
  customHeaders?: EmailHeaders
): ResendMessageParams {
  if (!customHeaders || customHeaders.length === 0) {
    return message;
  }

  const existingHeaders = message.headers || {};
  const newHeaders = headersToObject(customHeaders);

  return {
    ...message,
    headers: { ...existingHeaders, ...newHeaders },
  };
}

/**
 * Applies custom headers to an Amazon SES message payload.
 */
export function applyHeadersToSES(
  message: AmazonSESMessageParams,
  customHeaders?: EmailHeaders
): AmazonSESMessageParams {
  if (!customHeaders || customHeaders.length === 0) {
    return message;
  }

  const existingHeaders = message.headers || {};
  const newHeaders = headersToObject(customHeaders);

  return {
    ...message,
    headers: { ...existingHeaders, ...newHeaders },
  };
}

/**
 * Sanitizes and validates custom headers before applying them.
 * Returns only valid headers, filtering out any that fail validation.
 */
export function sanitizeHeaders(headers?: EmailHeaders): EmailHeaders {
  if (!headers) return [];
  return headers.filter(
    (h) => isValidHeaderName(h.name) && isValidHeaderValue(h.value)
  );
}
