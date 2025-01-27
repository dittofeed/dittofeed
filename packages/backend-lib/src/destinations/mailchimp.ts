import mailchimp, {
  MessagesMessage,
  MessagesSendRejectResponse,
  MessagesSendSuccessResponse,
} from "@mailchimp/mailchimp_transactional";
import { AxiosError } from "axios";
import { err, ok, ResultAsync } from "neverthrow";
import * as R from "remeda";
import { v5 as uuidv5 } from "uuid";

import { submitBatch } from "../apps/batch";
import { MESSAGE_METADATA_FIELDS } from "../constants";
import logger from "../logger";
import {
  EventType,
  InternalEventType,
  KnownBatchTrackData,
  MailChimpEvent,
} from "../types";

export async function sendMail({
  apiKey,
  message,
}: {
  apiKey: string;
  message: MessagesMessage;
}): Promise<
  ResultAsync<
    MessagesSendSuccessResponse,
    AxiosError | MessagesSendRejectResponse
  >
> {
  const mailchimpClient = mailchimp(apiKey);
  const response = await mailchimpClient.messages.send({ message });
  if (response instanceof AxiosError) {
    logger().error(
      {
        err: response,
        message,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        workspaceId: message.metadata?.workspaceId,
      },
      "Error sending mailchimp email",
    );
    return err(response);
  }
  const [firstResponse] = response;
  if (!firstResponse) {
    throw new Error("No response from Mailchimp");
  }
  switch (firstResponse.status) {
    case "rejected":
      return err(firstResponse);
    default:
      return ok(firstResponse);
  }
}

export async function submitMailChimpEvents({
  events,
}: {
  events: MailChimpEvent[];
}): Promise<void> {
  const items: { workspaceId: string; item: KnownBatchTrackData }[] =
    events.flatMap((e) => {
      const { workspaceId } = e.msg.metadata;
      if (!workspaceId) {
        logger().info(
          {
            event: e,
          },
          "Missing workspaceId in mailchimp event",
        );
        return [];
      }
      // eslint-disable-next-line no-underscore-dangle
      const messageId = uuidv5(e.msg._id, workspaceId);
      let event: InternalEventType;
      switch (e.event) {
        case "open":
          event = InternalEventType.EmailOpened;
          break;
        case "click":
          event = InternalEventType.EmailClicked;
          break;
        case "hard_bounce":
          event = InternalEventType.EmailBounced;
          break;
        case "spam":
          event = InternalEventType.EmailMarkedSpam;
          break;
        case "delivered":
          event = InternalEventType.EmailDelivered;
          break;
        default:
          logger().error(
            {
              workspaceId,
              event: e,
            },
            "Unhandled mailchimp event",
          );
          return [];
      }
      const properties = R.merge(
        { email: e.msg.email },
        R.pick(e.msg.metadata, MESSAGE_METADATA_FIELDS),
      );
      const { userId } = e.msg.metadata;
      if (!userId) {
        logger().info(
          {
            workspaceId,
            event: e,
          },
          "Missing userId in mailchimp event",
        );
        return [];
      }
      const batchData = {
        type: EventType.Track,
        event,
        userId,
        messageId,
        timestamp: new Date(e.ts * 1000).toISOString(),
        properties,
      } satisfies KnownBatchTrackData;

      return {
        workspaceId,
        item: batchData,
      };
    });

  const workspaceGroups = R.groupBy(items, (i) => i.workspaceId);

  const submissions = R.mapValues(workspaceGroups, (values, workspaceId) => {
    const batch = values.map((v) => v.item) satisfies KnownBatchTrackData[];
    return submitBatch({
      workspaceId,
      data: {
        batch,
      },
    });
  });

  await Promise.all(R.values(submissions));
}
