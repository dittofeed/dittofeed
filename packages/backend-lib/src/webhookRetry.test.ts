import { err, ok } from "neverthrow";

import {
  BackendMessageSendResult,
  ChannelType,
  InternalEventType,
  MessageSkippedType,
  SmsProviderType,
} from "./types";
import { RetryableWebhookError, retryableWebhookError } from "./webhookRetry";

function webhookFailure({
  status,
  code,
}: {
  status?: number;
  code?: string;
}): BackendMessageSendResult {
  return err({
    type: InternalEventType.MessageFailure,
    variant: {
      type: ChannelType.Webhook,
      code,
      response: status === undefined ? undefined : { status },
    },
  });
}

describe("retryableWebhookError", () => {
  it("returns nothing for a success", () => {
    const result: BackendMessageSendResult = ok({
      type: InternalEventType.MessageSent,
      variant: {
        type: ChannelType.Webhook,
        to: "user-1",
        request: { url: "https://example.com" },
        response: { status: 200 },
      },
    });
    expect(retryableWebhookError(result)).toBeUndefined();
  });

  it.each([408, 429, 500, 502, 503, 504])(
    "returns a retryable error for status %i",
    (status) => {
      const error = retryableWebhookError(webhookFailure({ status }));
      expect(error).toBeInstanceOf(RetryableWebhookError);
      expect(error?.status).toBe(status);
    },
  );

  it("returns a retryable error when there was no response at all", () => {
    const error = retryableWebhookError(
      webhookFailure({ code: "ECONNREFUSED" }),
    );
    expect(error).toBeInstanceOf(RetryableWebhookError);
    expect(error?.status).toBeUndefined();
    expect(error?.code).toBe("ECONNREFUSED");
  });

  it.each([400, 401, 403, 404, 409, 422])(
    "returns nothing for status %i, which is the receiver's final answer",
    (status) => {
      expect(retryableWebhookError(webhookFailure({ status }))).toBeUndefined();
    },
  );

  it("returns nothing for a failure on another channel", () => {
    const result: BackendMessageSendResult = err({
      type: InternalEventType.MessageFailure,
      variant: {
        type: ChannelType.Sms,
        provider: { type: SmsProviderType.Twilio, message: "unavailable" },
      },
    });
    expect(retryableWebhookError(result)).toBeUndefined();
  });

  it("returns nothing for a skipped message", () => {
    const result: BackendMessageSendResult = err({
      type: InternalEventType.MessageSkipped,
      variant: {
        type: MessageSkippedType.MissingIdentifier,
        identifierKey: "phone",
      },
    });
    expect(retryableWebhookError(result)).toBeUndefined();
  });
});
