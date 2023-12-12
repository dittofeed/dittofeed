import { createTransport } from "nodemailer";

import { EmailConfiguration } from "../types";

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
} & EmailConfiguration) {
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
  await transport.sendMail({
    from,
    to,
    subject,
    html: body,
    replyTo,
  });
}
