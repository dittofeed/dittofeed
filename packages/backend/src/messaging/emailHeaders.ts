import { EmailHeader, headersToRecord, validateHeaders } from "isomorphic-lib/src/types/emailHeaders";

/**
 * Prepare headers for SMTP (nodemailer) transport.
 * Nodemailer accepts headers as Record<string, string> or as an array.
 */
export function prepareSmtpHeaders(
  customHeaders?: EmailHeader[]
): Record<string, string> | undefined {
  const validation = validateHeaders(customHeaders);
  if (!validation.valid) {
    console.warn(
      "[EmailHeaders] Blocked headers removed:",
      validation.errors
    );
    // Filter out invalid headers
    const filtered = customHeaders?.filter(
      (h) => !validation.errors.some((e) => e.includes(h.name))
    );
    return headersToRecord(filtered);
  }
  return headersToRecord(customHeaders);
}

/**
 * Prepare headers for SendGrid API.
 * SendGrid accepts headers as Record<string, string>.
 */
export function prepareSendGridHeaders(
  customHeaders?: EmailHeader[]
): Record<string, string> | undefined {
  return prepareSmtpHeaders(customHeaders);
}

/**
 * Prepare headers for Postmark API.
 * Postmark accepts headers as Array<{ Name: string; Value: string }>.
 */
export function preparePostmarkHeaders(
  customHeaders?: EmailHeader[]
): Array<{ Name: string; Value: string }> | undefined {
  const validation = validateHeaders(customHeaders);
  if (!validation.valid) {
    console.warn(
      "[EmailHeaders] Blocked headers removed:",
      validation.errors
    );
    customHeaders = customHeaders?.filter(
      (h) => !validation.errors.some((e) => e.includes(h.name))
    );
  }
  if (!customHeaders || customHeaders.length === 0) return undefined;
  return customHeaders.map((h) => ({ Name: h.name, Value: h.value }));
}

/**
 * Prepare headers for Amazon SES.
 * SES accepts headers in the raw message or via MessageTag/Headers API.
 */
export function prepareSesHeaders(
  customHeaders?: EmailHeader[]
): Record<string, string> | undefined {
  return prepareSmtpHeaders(customHeaders);
}

/**
 * Prepare headers for Resend API.
 * Resend accepts headers as Record<string, string>.
 */
export function prepareResendHeaders(
  customHeaders?: EmailHeader[]
): Record<string, string> | undefined {
  return prepareSmtpHeaders(customHeaders);
}
