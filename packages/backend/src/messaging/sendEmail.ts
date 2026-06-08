/**
 * Example integration showing how custom headers are passed to each provider.
 * This file demonstrates the pattern for integrating custom headers into
 * Dittofeed's existing email sending logic.
 */

import { EmailHeader } from "isomorphic-lib/src/types/emailHeaders";
import {
  prepareSmtpHeaders,
  prepareSendGridHeaders,
  preparePostmarkHeaders,
  prepareSesHeaders,
  prepareResendHeaders,
} from "./emailHeaders";

/**
 * EmailMessage definition extended with custom headers support.
 */
export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: EmailHeader[];
}

export type EmailProvider = "smtp" | "sendgrid" | "postmark" | "ses" | "resend";

/**
 * Send an email with custom headers support.
 * This function demonstrates how to integrate with each provider.
 */
export async function sendEmailWithHeaders(
  message: EmailMessage,
  provider: EmailProvider
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    switch (provider) {
      case "smtp":
        return await sendViaSmtp(message);
      case "sendgrid":
        return await sendViaSendGrid(message);
      case "postmark":
        return await sendViaPostmark(message);
      case "ses":
        return await sendViaSes(message);
      case "resend":
        return await sendViaResend(message);
      default:
        return { success: false, error: `Unknown provider: ${provider}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

async function sendViaSmtp(message: EmailMessage) {
  const headers = prepareSmtpHeaders(message.headers);

  // Integration with nodemailer:
  // const mailOptions = {
  //   from: message.from,
  //   to: message.to,
  //   subject: message.subject,
  //   html: message.html,
  //   text: message.text,
  //   replyTo: message.replyTo,
  //   headers: headers,  // <-- custom headers passed here
  // };
  // const info = await transporter.sendMail(mailOptions);

  return { success: true, messageId: `smtp-${Date.now()}` };
}

async function sendViaSendGrid(message: EmailMessage) {
  const headers = prepareSendGridHeaders(message.headers);

  // Integration with SendGrid:
  // const msg = {
  //   to: message.to,
  //   from: message.from,
  //   subject: message.subject,
  //   html: message.html,
  //   text: message.text,
  //   replyTo: message.replyTo,
  //   headers: headers,  // <-- custom headers passed here
  // };
  // await sgMail.send(msg);

  return { success: true, messageId: `sg-${Date.now()}` };
}

async function sendViaPostmark(message: EmailMessage) {
  const headers = preparePostmarkHeaders(message.headers);

  // Find MessageStream header for Postmark-specific handling
  const messageStreamHeader = message.headers?.find(
    (h) => h.name.toLowerCase() === "x-pm-message-stream"
  );

  // Integration with Postmark:
  // const postmarkMessage = {
  //   From: message.from,
  //   To: message.to,
  //   Subject: message.subject,
  //   HtmlBody: message.html,
  //   TextBody: message.text,
  //   ReplyTo: message.replyTo,
  //   Headers: headers,  // <-- custom headers passed here
  //   MessageStream: messageStreamHeader?.value ?? "outbound",  // <-- Postmark stream
  // };
  // const response = await postmarkClient.sendEmail(postmarkMessage);

  return { success: true, messageId: `pm-${Date.now()}` };
}

async function sendViaSes(message: EmailMessage) {
  const headers = prepareSesHeaders(message.headers);

  // Integration with Amazon SES:
  // Headers can be included via raw email sending or the v2 API
  // const params = {
  //   Content: {
  //     Simple: {
  //       Body: { Html: { Data: message.html } },
  //       Subject: { Data: message.subject },
  //     },
  //   },
  //   Destination: { ToAddresses: [message.to] },
  //   FromEmailAddress: message.from,
  //   // For custom headers, use raw email format
  // };

  return { success: true, messageId: `ses-${Date.now()}` };
}

async function sendViaResend(message: EmailMessage) {
  const headers = prepareResendHeaders(message.headers);

  // Integration with Resend:
  // const response = await resend.emails.send({
  //   from: message.from,
  //   to: message.to,
  //   subject: message.subject,
  //   html: message.html,
  //   text: message.text,
  //   reply_to: message.replyTo,
  //   headers: headers,  // <-- custom headers passed here
  // });

  return { success: true, messageId: `resend-${Date.now()}` };
}
