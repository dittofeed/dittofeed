import responseError from "@sendgrid/helpers/classes/response-error";
import sendgridMail from "@sendgrid/mail";
import { Result,ResultAsync } from "neverthrow";

function guardResponseError(e: unknown): sendgridMail.ResponseError {
  if (e instanceof responseError) {
    return e;
  }
  throw e;
}

export async function sendMail({
  apiKey,
  mailData,
}: {
  apiKey: string;
  mailData: sendgridMail.MailDataRequired;
}): Promise<
  Result<sendgridMail.ClientResponse | null, sendgridMail.ResponseError>
> {
  sendgridMail.setApiKey(apiKey);

  return ResultAsync.fromPromise(
    sendgridMail.send(mailData),
    guardResponseError
  ).map((resultArray) => resultArray[0]);
}
