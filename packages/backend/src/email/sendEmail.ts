/**
 * Example integration showing how custom headers are applied
 * when sending emails through various providers in Dittofeed.
 *
 * This file demonstrates the pattern - actual integration would
 * modify the existing sendEmail function in the Dittofeed codebase.
 */

import { EmailHeaders } from '@dittofeed/isomorphic-lib/src/types/emailHeaders';
import {
  formatHeadersForSmtp,
  formatHeadersForSendGrid,
  formatHeadersForPostmark,
  formatHeadersForSes,
} from './customHeaders';

export interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: EmailHeaders;
  provider: 'smtp' | 'sendgrid' | 'postmark' | 'ses';
}

/**
 * Demonstrates how each provider integration would include custom headers.
 * In practice, this would be integrated into Dittofeed's existing email sending logic.
 */
export async function sendEmailWithHeaders(params: SendEmailParams): Promise<void> {
  const { provider, headers, from, to, subject, html, text, replyTo } = params;

  switch (provider) {
    case 'smtp': {
      // nodemailer transport
      const smtpHeaders = formatHeadersForSmtp(headers);
      const mailOptions = {
        from,
        to,
        subject,
        html,
        text,
        replyTo,
        ...(smtpHeaders && { headers: smtpHeaders }),
      };
      // await transporter.sendMail(mailOptions);
      console.log('SMTP mail options:', mailOptions);
      break;
    }

    case 'sendgrid': {
      const sgHeaders = formatHeadersForSendGrid(headers);
      const sgMessage = {
        to,
        from,
        subject,
        html,
        text,
        replyTo,
        ...(sgHeaders && { headers: sgHeaders }),
      };
      // await sgMail.send(sgMessage);
      console.log('SendGrid message:', sgMessage);
      break;
    }

    case 'postmark': {
      const pmHeaders = formatHeadersForPostmark(headers);
      const pmMessage = {
        From: from,
        To: to,
        Subject: subject,
        HtmlBody: html,
        TextBody: text,
        ReplyTo: replyTo,
        ...(pmHeaders && { Headers: pmHeaders }),
      };
      // await postmarkClient.sendEmail(pmMessage);
      console.log('Postmark message:', pmMessage);
      break;
    }

    case 'ses': {
      const sesHeaders = formatHeadersForSes(headers);
      // For SES, headers would be included in the raw message
      // or via the SES v2 API's Headers parameter
      const sesParams = {
        Source: from,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: {
            Html: { Data: html },
            ...(text && { Text: { Data: text } }),
          },
        },
        // Custom headers added to raw message
        ...(sesHeaders && { _customHeaders: sesHeaders }),
      };
      // await sesClient.send(new SendEmailCommand(sesParams));
      console.log('SES params:', sesParams);
      break;
    }
  }
}
