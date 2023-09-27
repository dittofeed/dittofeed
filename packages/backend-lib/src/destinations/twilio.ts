import TwilioClient from "twilio";

export async function sendSms({
  body,
  accountSid,
  authToken,
  messagingServiceSid,
  to,
}: {
  body: string;
  to: string;
  accountSid: string;
  messagingServiceSid: string;
  authToken: string;
}) {
  await TwilioClient(accountSid, authToken).messages.create({
    messagingServiceSid,
    body,
    to,
  });
}
