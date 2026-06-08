import {
  CustomEmailHeaders,
  headersArrayToRecord,
  validateAndSanitizeHeaders,
} from "@dittofeed/isomorphic-lib/src/emailHeaders";
import type { MailDataRequired } from "@sendgrid/mail";

/**
 * Apply custom headers to a Nodemailer (SMTP) message options object.
 */
export function applyHeadersToSmtp(
  mailOptions: Record<string, unknown>,
  headers: CustomEmailHeaders
): Record<string, unknown> {
  if (!headers || headers.length === 0) {
    return mailOptions;
  }
  const headersRecord = headersArrayToRecord(headers);
  return {
    ...mailOptions,
    headers: {
      ...(mailOptions.headers as Record<string, string> | undefined),
      ...headersRecord,
    },
  };
}

/**
 * Apply custom headers to a SendGrid message object.
 */
export function applyHeadersToSendGrid(
  message: Partial<MailDataRequired>,
  headers: CustomEmailHeaders
): Partial<MailDataRequired> {
  if (!headers || headers.length === 0) {
    return message;
  }
  const headersRecord = headersArrayToRecord(headers);
  return {
    ...message,
    headers: {
      ...(message.headers as Record<string, string> | undefined),
      ...headersRecord,
    },
  };
}

/**
 * Apply custom headers to a Postmark message object.
 * Postmark uses a specific 'Headers' field with {Name, Value} objects,
 * plus some special headers like 'X-PM-Message-Stream' map to the MessageStream field.
 */
export function applyHeadersToPostmark(
  message: Record<string, unknown>,
  headers: CustomEmailHeaders
): Record<string, unknown> {
  if (!headers || headers.length === 0) {
    return message;
  }

  const updatedMessage = { ...message };
  const postmarkHeaders: Array<{ Name: string; Value: string }> = [
    ...((message.Headers as Array<{ Name: string; Value: string }>) || []),
  ];

  for (const header of headers) {
    // Special handling for Postmark's MessageStream header
    if (header.name === "X-PM-Message-Stream") {
      updatedMessage.MessageStream = header.value;
    } else {
      postmarkHeaders.push({ Name: header.name, Value: header.value });
    }
  }

  if (postmarkHeaders.length > 0) {
    updatedMessage.Headers = postmarkHeaders;
  }

  return updatedMessage;
}

/**
 * Apply custom headers to an Amazon SES (v2) message object.
 */
export function applyHeadersToSes(
  params: Record<string, unknown>,
  headers: CustomEmailHeaders
): Record<string, unknown> {
  if (!headers || headers.length === 0) {
    return params;
  }
  const headersRecord = headersArrayToRecord(headers);
  const existingHeaders =
    (params.Content as Record<string, unknown>)?.Raw !== undefined
      ? {}
      : headersRecord;

  // For SES v2 with Simple content, headers go into the Headers field
  if ((params.Content as Record<string, unknown>)?.Simple) {
    const content = params.Content as Record<string, unknown>;
    const simple = content.Simple as Record<string, unknown>;
    return {
      ...params,
      Content: {
        ...content,
        Simple: {
          ...simple,
          Headers: Object.entries(existingHeaders).map(([Name, Value]) => ({
            Name,
            Value,
          })),
        },
      },
    };
  }

  return params;
}

/**
 * Apply custom headers to a Resend message object.
 */
export function applyHeadersToResend(
  message: Record<string, unknown>,
  headers: CustomEmailHeaders
): Record<string, unknown> {
  if (!headers || headers.length === 0) {
    return message;
  }
  const headersRecord = headersArrayToRecord(headers);
  return {
    ...message,
    headers: {
      ...(message.headers as Record<string, string> | undefined),
      ...headersRecord,
    },
  };
}

/**
 * Generic function to apply custom headers based on provider type.
 */
export function applyCustomHeaders(
  providerType: string,
  message: Record<string, unknown>,
  rawHeaders: unknown
): Record<string, unknown> {
  const headers = validateAndSanitizeHeaders(rawHeaders);
  if (headers.length === 0) {
    return message;
  }

  switch (providerType) {
    case "Smtp":
      return applyHeadersToSmtp(message, headers);
    case "SendGrid":
      return applyHeadersToSendGrid(
        message as Partial<MailDataRequired>,
        headers
      ) as Record<string, unknown>;
    case "Postmark":
      return applyHeadersToPostmark(message, headers);
    case "AmazonSes":
      return applyHeadersToSes(message, headers);
    case "Resend":
      return applyHeadersToResend(message, headers);
    default:
      return message;
  }
}
