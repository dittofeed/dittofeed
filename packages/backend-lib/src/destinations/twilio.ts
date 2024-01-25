import { err, ok, Result } from "neverthrow";
import TwilioClient from "twilio";
import RestException from "twilio/lib/base/RestException";

import logger from "../logger";

export const TwilioRestException = RestException;

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
    logger().debug(
      {
        accountSid,
        messagingServiceSid,
        body,
        to,
      },
      "Sending SMS",
    );
    const response = await TwilioClient(accountSid, authToken).messages.create({
      messagingServiceSid,
      body,
      to,
      // TODO add callback with query params to denote identity of message
    });
    logger().debug({ response }, "SMS sent");
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
