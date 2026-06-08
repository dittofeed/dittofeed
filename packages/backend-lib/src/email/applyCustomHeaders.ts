/**
 * Integration module that applies custom headers to various email provider payloads.
 * This module is designed to be called from the main messaging pipeline.
 */

import {
  CustomEmailHeader,
  parseCustomHeaders,
  sanitizeHeaders,
  renderHeaderValues,
  headersToMap,
  headersToPostmarkFormat,
  headersToSendGridFormat,
  headersToSESFormat,
} from "./customHeaders";

export type EmailProvider = "smtp" | "postmark" | "sendgrid" | "ses" | "resend";

export interface ApplyHeadersOptions {
  /** Raw headers from the message template definition */
  rawHeaders: unknown;
  /** Template variables for rendering dynamic header values */
  templateVariables?: Record<string, string>;
  /** The email provider being used */
  provider: EmailProvider;
}

export interface SmtpHeadersResult {
  provider: "smtp";
  headers: Record<string, string>;
}

export interface PostmarkHeadersResult {
  provider: "postmark";
  headers: Array<{ Name: string; Value: string }>;
}

export interface SendGridHeadersResult {
  provider: "sendgrid";
  headers: Record<string, string>;
}

export interface SESHeadersResult {
  provider: "ses";
  headers: Array<{ Name: string; Value: string }>;
}

export interface ResendHeadersResult {
  provider: "resend";
  headers: Record<string, string>;
}

export type HeadersResult =
  | SmtpHeadersResult
  | PostmarkHeadersResult
  | SendGridHeadersResult
  | SESHeadersResult
  | ResendHeadersResult;

/**
 * Processes raw custom headers from a message template and returns
 * them in the format appropriate for the specified email provider.
 */
export function applyCustomHeaders(options: ApplyHeadersOptions): HeadersResult {
  const { rawHeaders, templateVariables = {}, provider } = options;

  // Parse, render variables, and sanitize
  let headers = parseCustomHeaders(rawHeaders);
  headers = renderHeaderValues(headers, templateVariables);
  headers = sanitizeHeaders(headers);

  switch (provider) {
    case "smtp":
      return { provider: "smtp", headers: headersToMap(headers) };
    case "postmark":
      return { provider: "postmark", headers: headersToPostmarkFormat(headers) };
    case "sendgrid":
      return { provider: "sendgrid", headers: headersToSendGridFormat(headers) };
    case "ses":
      return { provider: "ses", headers: headersToSESFormat(headers) };
    case "resend":
      return { provider: "resend", headers: headersToMap(headers) };
    default:
      return { provider: "smtp", headers: headersToMap(headers) };
  }
}
