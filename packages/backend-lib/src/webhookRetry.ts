import { ChannelType, InternalEventType } from "isomorphic-lib/src/types";

import { BackendMessageSendResult } from "./types";

/** Thrown by a journey's message activity so its retries apply to a webhook failure that can pass. */
export class RetryableWebhookError extends Error {
  constructor(
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(
      `webhook failed and may pass on retry: ${status ?? code ?? "no response"}`,
    );
    this.name = "RetryableWebhookError";
  }
}

/**
 * The error to throw when a webhook send failed in a way that can pass on its own: no answer at all (a refused or
 * reset connection, a timeout) or an answer saying "later" (408, 429, any 5xx). Undefined for a success, any other
 * channel, and any other answer, which is the receiver's decision and final.
 *
 * sendMessage's contract is that re-tryable errors are thrown and non-retryable ones returned, but sendWebhook returns
 * every failure, so a journey's message node never retried a webhook: one deploy or database blip on the receiving side
 * and the message was lost. Only the journey activity throws on this; sendWebhook is unchanged, so the template test
 * and the batch-message API still get the failure as a result.
 */
export function retryableWebhookError(
  result: BackendMessageSendResult,
): RetryableWebhookError | undefined {
  if (result.isOk()) {
    return undefined;
  }
  const failure = result.error;
  if (
    failure.type !== InternalEventType.MessageFailure ||
    failure.variant.type !== ChannelType.Webhook
  ) {
    return undefined;
  }
  const { response, code } = failure.variant;
  const status = response?.status;
  if (
    typeof status !== "number" ||
    status === 408 ||
    status === 429 ||
    status >= 500
  ) {
    return new RetryableWebhookError(status, code);
  }
  return undefined;
}
