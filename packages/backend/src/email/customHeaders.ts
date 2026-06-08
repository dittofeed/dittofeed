import {
  EmailHeaders,
  headersToRecord,
  validateEmailHeaders,
} from '@dittofeed/isomorphic-lib/src/types/emailHeaders';

/**
 * Processes custom email headers for different email providers.
 * Each provider has a specific format for custom headers.
 */

export interface SmtpHeaders {
  [key: string]: string;
}

export interface SendGridHeaders {
  [key: string]: string;
}

export interface PostmarkHeader {
  Name: string;
  Value: string;
}

export interface SesHeader {
  Name: string;
  Value: string;
}

/**
 * Format headers for SMTP (nodemailer) transport
 */
export function formatHeadersForSmtp(headers?: EmailHeaders): SmtpHeaders | undefined {
  if (!headers || headers.length === 0) return undefined;

  const validation = validateEmailHeaders(headers);
  if (!validation.valid) {
    console.warn('Invalid email headers filtered:', validation.errors);
  }

  return headersToRecord(
    headers.filter((h) => h.name && h.name.trim())
  );
}

/**
 * Format headers for SendGrid API
 */
export function formatHeadersForSendGrid(headers?: EmailHeaders): SendGridHeaders | undefined {
  if (!headers || headers.length === 0) return undefined;

  const validation = validateEmailHeaders(headers);
  if (!validation.valid) {
    console.warn('Invalid email headers filtered:', validation.errors);
  }

  return headersToRecord(
    headers.filter((h) => h.name && h.name.trim())
  );
}

/**
 * Format headers for Postmark API
 * Postmark uses an array of { Name, Value } objects
 */
export function formatHeadersForPostmark(headers?: EmailHeaders): PostmarkHeader[] | undefined {
  if (!headers || headers.length === 0) return undefined;

  const validation = validateEmailHeaders(headers);
  if (!validation.valid) {
    console.warn('Invalid email headers filtered:', validation.errors);
  }

  return headers
    .filter((h) => h.name && h.name.trim())
    .map((h) => ({
      Name: h.name.trim(),
      Value: h.value ?? '',
    }));
}

/**
 * Format headers for Amazon SES
 */
export function formatHeadersForSes(headers?: EmailHeaders): SesHeader[] | undefined {
  if (!headers || headers.length === 0) return undefined;

  const validation = validateEmailHeaders(headers);
  if (!validation.valid) {
    console.warn('Invalid email headers filtered:', validation.errors);
  }

  return headers
    .filter((h) => h.name && h.name.trim())
    .map((h) => ({
      Name: h.name.trim(),
      Value: h.value ?? '',
    }));
}
