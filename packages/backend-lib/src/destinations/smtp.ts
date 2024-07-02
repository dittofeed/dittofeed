import { err, ok, Result } from "neverthrow";
import { createTransport } from "nodemailer";
import Mail from "nodemailer/lib/mailer";
import { Overwrite } from "utility-types";

import {
  EmailConfiguration,
  EmailProviderType,
  EmailSmtpSuccess,
  MessageSmtpFailure,
  SmtpSecret,
} from "../types";

export type SendSmtpMailParams = Overwrite<
  SmtpSecret,
  {
    host: string;
    port?: number;
  }
> &
  EmailConfiguration & {
    attachments?: Mail.Attachment[];
  };

export async function sendMail({
  host,
  port,
  username,
  password,
  from,
  to,
  subject,
  body,
  attachments,
  replyTo,
  headers,
}: SendSmtpMailParams): Promise<Result<EmailSmtpSuccess, MessageSmtpFailure>> {
  const transport = createTransport({
    host,
    port,
    auth:
      username && password
        ? {
            user: username,
            pass: password,
          }
        : undefined,
  });
  try {
    const response = await transport.sendMail({
      from,
      to,
      subject,
      html: body,
      replyTo,
      headers,
      attachments,
    });

    return ok({
      type: EmailProviderType.Smtp,
      messageId: response.messageId,
    });
  } catch (e) {
    return err({
      type: EmailProviderType.Smtp,
      message: (e as Error).message,
    });
  }
}
