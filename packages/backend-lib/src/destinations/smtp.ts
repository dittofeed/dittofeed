import { createTransport } from "nodemailer";

export async function sendEmail({
  host,
  port,
  username,
  password,
}: {
  host: string;
  port?: number;
  username?: string;
  password?: string;
}) {
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
  transport.sendMail({});
}
