/**
 * Integration module showing how to integrate custom headers into
 * the Dittofeed messaging pipeline.
 *
 * This module demonstrates how the email sending functions should be
 * modified to support custom headers from message templates.
 */

import { EmailHeader } from "isomorphic-lib/src/emailHeaders";
import {
  applyHeadersToSmtp,
  applyHeadersToSendGrid,
  applyHeadersToPostmark,
  applyHeadersToSes,
  applyHeadersToResend,
} from "../emailHeaders";

export type EmailProviderType =
  | "smtp"
  | "sendgrid"
  | "postmark"
  | "ses"
  | "resend";

export interface SendEmailParams {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: EmailHeader[];
  provider: EmailProviderType;
}

/**
 * Example of how the email sending logic integrates custom headers.
 * In the actual Dittofeed codebase, this would be integrated into
 * the existing sendEmail function in the messaging module.
 */
export function buildProviderPayload(params: SendEmailParams): unknown {
  const { provider, headers = [], to, from, subject, html, text } = params;

  switch (provider) {
    case "smtp": {
      const mailOptions = {
        to,
        from,
        subject,
        html,
        text,
      };
      return applyHeadersToSmtp(mailOptions, headers);
    }
    case "sendgrid": {
      const mailData = {
        to,
        from,
        subject,
        html,
        text,
      };
      return applyHeadersToSendGrid(mailData, headers);
    }
    case "postmark": {
      const message = {
        To: to,
        From: from,
        Subject: subject,
        HtmlBody: html,
        TextBody: text,
      };
      return applyHeadersToPostmark(message, headers);
    }
    case "ses": {
      const message = {
        Destination: { ToAddresses: [to] },
        Source: from,
        Message: {
          Subject: { Data: subject },
          Body: { Html: { Data: html }, Text: { Data: text } },
        },
      };
      return applyHeadersToSes(message, headers);
    }
    case "resend": {
      const message = {
        to,
        from,
        subject,
        html,
        text,
      };
      return applyHeadersToResend(message, headers);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
