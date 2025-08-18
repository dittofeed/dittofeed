import { Messaging, SignalWire } from "@signalwire/realtime-api";
import { Static, Type } from "@sinclair/typebox";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { Result } from "neverthrow";

export interface SignalWireNonRetryableError {
  errorCode: string;
  errorMessage: string;
  status: string;
}

export interface SignalWireSuccess {
  sid: string;
  status: string;
}

export const SignalWireResult = Type.Object({
  sid: Type.String(),
  error_code: Type.Optional(Type.String()),
  error_message: Type.Optional(Type.String()),
  status: Type.String(),
});

export async function sendSms({
  project,
  token,
  to,
  body,
  from,
}: {
  project: string;
  to: string;
  body: string;
  token: string;
  from: string;
}): Promise<Result<SignalWireSuccess, SignalWireNonRetryableError>> {
  const client = await SignalWire({
    project,
    token,
  });
  try {
    const result: unknown = await client.messaging.send({
      from,
      to,
      body,
    });
    const verifiedResult = schemaValidateWithErr(result, SignalWireResult);
  } catch (error) {
    // TODO throw retryable error
    // TODO return not retryable error
    throw new Error("Not implemented");
  }
}
