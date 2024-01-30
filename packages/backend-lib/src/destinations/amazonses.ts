import {
  MessageTag,
  SendEmailCommand,
  type SendEmailCommandInput,
  SendEmailCommandOutput,
  SESClient,
  SESServiceException,
} from "@aws-sdk/client-ses";
import { Result, ResultAsync } from "neverthrow";

import logger from "../logger";
import { AmazonSesConfig, AmazonSesMailFields } from "../types";

// README the typescript types on this are wrong, body is not of type string,
// it's a parsed JSON object
function guardResponseError(e: unknown): SESServiceException {
  if (e instanceof SESServiceException) {
    return e;
  }
  throw e;
}

export async function sendMail({
  config,
  mailData,
}: {
  config: AmazonSesConfig;
  mailData: AmazonSesMailFields;
}): Promise<Result<SendEmailCommandOutput, SESServiceException>> {
  const { accessKeyId, secretAccessKey, region } = config;
  const client = new SESClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const replyTo = mailData.replyTo
    ? {
        ReplyToAddresses: [mailData.replyTo],
      }
    : {};

  const tags = mailData.tags
    ? {
        Tags: Object.keys(mailData.tags).reduce(
          (a: MessageTag[], k: string) => {
            return mailData.tags
              ? [{ Name: k, Value: mailData.tags[k] }, ...a]
              : a;
          },
          [],
        ),
      }
    : {};

  const input: SendEmailCommandInput = {
    Source: mailData.from,
    Destination: {
      ToAddresses: [mailData.to],
    },
    Message: {
      Subject: {
        Data: mailData.subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: mailData.html,
          Charset: "UTF-8",
        },
      },
    },
    ...tags,
    ...replyTo,
  };

  logger().debug(mailData.tags);

  const command = new SendEmailCommand(input);

  return ResultAsync.fromPromise(client.send(command), guardResponseError).map(
    (resultArray) => resultArray,
  );
}
