import { Messaging, SignalWire } from "@signalwire/realtime-api";
import { Static, Type } from "@sinclair/typebox";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import logger from "../logger";

export interface SignalWireNonRetryableError {
  errorCode: string;
  errorMessage: string;
  status: string;
}

export type SignalWireHandlingApplicationError = Error;

export interface SignalWireSuccess {
  sid: string;
  status: string;
}

export const SignalWireResult = Type.Object({
  sid: Type.String(),
  error_code: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  error_message: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  status: Type.String(),
});

export const SIGNAL_WIRE_FAILURE_STATUSES = new Set(["failed", "undelivered"]);

export async function sendSms({
  project,
  token,
  to,
  body,
  from,
}: {
  workspaceId: string;
  project: string;
  to: string;
  body: string;
  token: string;
  from: string;
  // FIXME add tags
}): Promise<
  Result<
    SignalWireSuccess,
    SignalWireNonRetryableError | SignalWireHandlingApplicationError
  >
> {
  const client = await SignalWire({
    project,
    token,
  });
  try {
    // FIXME add callback url with tags as query params
    const result: unknown = await client.messaging.send({
      from,
      to,
      body,
    });

    const verifiedResult = schemaValidateWithErr(result, SignalWireResult);
    if (verifiedResult.isErr()) {
      return err(verifiedResult.error);
    }

    const {
      sid,
      status,
      error_code: errorCode,
      error_message: errorMessage,
    } = verifiedResult.value;
    // check status and error_code if neither indicate an error, return a success result
    if (!SIGNAL_WIRE_FAILURE_STATUSES.has(status) && !errorCode) {
      return ok({ sid, status });
    }
  } catch (error) {
    logger().error(
      {
        err: error,
      },
      "transient signalwire error",
    );
    throw error;
  }
}
