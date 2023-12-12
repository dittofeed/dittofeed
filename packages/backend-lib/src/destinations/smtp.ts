import { err, ok, Result } from "neverthrow";
import { createTransport } from "nodemailer";

import {
  EmailConfiguration,
  EmailProviderType,
  EmailSmtpSuccess,
  MessageSmtpFailure,
} from "../types";

export async function sendEmail({
  host,
  port,
  username,
  password,
  from,
  to,
  subject,
  body,
  replyTo,
}: {
  host: string;
  port?: number;
  username?: string;
  password?: string;
} & EmailConfiguration): Promise<Result<EmailSmtpSuccess, MessageSmtpFailure>> {
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
