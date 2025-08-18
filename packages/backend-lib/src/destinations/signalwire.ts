import { RestClient } from "@signalwire/compatibility-api";
import { Static, Type } from "@sinclair/typebox";
import { err, ok, Result } from "neverthrow";
import qs from "querystring";
import * as R from "remeda";

import config from "../config";
import { MESSAGE_METADATA_FIELDS } from "../constants";
import logger from "../logger";
import {
  MessageSignalWireServiceFailure,
  MessageTags,
  SmsProviderType,
  SmsSignalWireSuccess,
} from "../types";

export type SignalWireHandlingApplicationError = Error;

export const SignalWireResult = Type.Object({
  sid: Type.String(),
  error_code: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  error_message: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  status: Type.String(),
});

export type SignalWireResult = Static<typeof SignalWireResult>;

export const SIGNAL_WIRE_RETRYABLE_ERROR_CODES = new Set([
  // application error
  30008,
  // throughput limit exceeded
  30022,
  // t-mobile limit exceeded
  30027,
]);

export async function sendSms({
  project,
  token,
  to,
  body,
  from,
  tags,
  spaceUrl,
  disableCallback = false,
}: {
  project: string;
  to: string;
  body: string;
  token: string;
  from: string;
  spaceUrl: string;
  tags?: MessageTags;
  disableCallback?: boolean;
}): Promise<
  Result<
    SmsSignalWireSuccess,
    MessageSignalWireServiceFailure | SignalWireHandlingApplicationError
  >
> {
  const client = RestClient(project, token, {
    signalwireSpaceUrl: spaceUrl,
  });
  try {
    let statusCallback: string | undefined;
    if (!disableCallback) {
      const baseCallbackUrl = `${config().dashboardUrl}/api/public/webhooks/signalwire`;
      let encodedQueryParams = "";
      if (tags) {
        const metadataTags = R.pick(tags, MESSAGE_METADATA_FIELDS);
        encodedQueryParams = `?${qs.stringify(metadataTags)}`;
      }
      statusCallback = `${baseCallbackUrl}${encodedQueryParams}`;
    }
    const { sid, status, errorCode, errorMessage } =
      await client.messages.create({
        from,
        to,
        body,
        statusCallback,
      });

    // check status and error_code if neither indicate an error, return a success result
    if (!errorCode) {
      return ok({ sid, status, type: SmsProviderType.SignalWire });
    }
    logger().debug(
      {
        errorCode,
        errorMessage,
        status,
      },
      "signalwire error value",
    );
    if (SIGNAL_WIRE_RETRYABLE_ERROR_CODES.has(errorCode)) {
      throw new Error(
        `transient signalwire error: code=${errorCode} message=${errorMessage}`,
      );
    }
    return err({
      type: SmsProviderType.SignalWire,
      errorCode,
      errorMessage,
      status,
    });
  } catch (error) {
    // FIXME handle non-retryable errors see the shape of the error
    logger().error(
      {
        err: error,
      },
      "thrown signalwire error",
    );
    throw error;
  }
}
