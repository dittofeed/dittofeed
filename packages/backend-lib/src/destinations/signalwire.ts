import { RestClient } from "@signalwire/compatibility-api";
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

export const SIGNAL_WIRE_RETRYABLE_ERROR_CODES = new Set([
  // application error
  "30008",
  // throughput limit exceeded
  "30022",
  // t-mobile limit exceeded
  "30027",
]);

/**
 * Represents the inferred structure of an error object thrown by the
 * SignalWire Compatibility API SDK when a REST request fails.
 */
export interface SignalWireApiError extends Error {
  /**
   * The HTTP status code of the API response.
   * @example 400
   */
  status: number;

  /**
   * The SignalWire-specific numerical error code.
   * @see https://developer.signalwire.com/rest/compatibility-api/overview/error-codes/
   * @example 21212
   */
  code: string;

  /**
   * A URL linking to more information about the error code.
   * @example "https://www.signalwire.com/docs/errors/21212"
   */
  moreInfo: string;
}

function isRetryableSignalWireError(error: SignalWireApiError): boolean {
  if (error.status >= 500) {
    return true;
  }
  if (SIGNAL_WIRE_RETRYABLE_ERROR_CODES.has(error.code)) {
    return true;
  }
  return false;
}

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
}): Promise<Result<SmsSignalWireSuccess, MessageSignalWireServiceFailure>> {
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
    if (SIGNAL_WIRE_RETRYABLE_ERROR_CODES.has(errorCode.toString())) {
      throw new Error(
        `transient signalwire error: code=${errorCode} message=${errorMessage}`,
      );
    }
    return err({
      type: SmsProviderType.SignalWire,
      errorCode: errorCode.toString(),
      errorMessage,
      status,
    });
  } catch (error) {
    const signalWireErr = error as SignalWireApiError;
    if (isRetryableSignalWireError(signalWireErr)) {
      throw new Error(
        `transient signalwire error: code=${signalWireErr.code} message=${signalWireErr.message}`,
      );
    }
    return err({
      type: SmsProviderType.SignalWire,
      errorCode: signalWireErr.code,
      errorMessage: signalWireErr.message,
      status: signalWireErr.status.toString(),
    });
  }
}
