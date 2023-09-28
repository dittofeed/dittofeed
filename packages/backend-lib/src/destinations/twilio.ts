import { err, ok, Result } from "neverthrow";
import TwilioClient from "twilio";
import RestException from "twilio/lib/base/RestException";

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
}): Promise<Result<{ sid: string }, RestException | Error>> {
  try {
    const response = await TwilioClient(accountSid, authToken).messages.create({
      messagingServiceSid,
      body,
      to,
      // TODO add callback with query params to denote identity of message
    });
    return ok({ sid: response.sid });
  } catch (e) {
    if (e instanceof RestException) {
      return err(e);
    }
    // unknown error
    const error = e as Error;
    return err(error);
  }
}
