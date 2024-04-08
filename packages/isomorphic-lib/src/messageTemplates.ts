import { err, ok, Result } from "neverthrow";

import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "./resultHandling/schemaValidation";
import { assertUnreachable } from "./typeAssertions";
import {
  ChannelType,
  MessageTemplateResourceDefinition,
  MessageTemplateResourceDraft,
  ParsedWebhookBody,
} from "./types";

export function messageTemplatePath({
  id,
  channel,
}: {
  id: string;
  channel: ChannelType;
}) {
  let channelSubPath: string;
  switch (channel) {
    case ChannelType.Email:
      channelSubPath = "email";
      break;
    case ChannelType.MobilePush:
      channelSubPath = "mobile-push";
      break;
    case ChannelType.Sms:
      channelSubPath = "sms";
      break;
    case ChannelType.Webhook:
      channelSubPath = "webhook";
      break;
    default:
      assertUnreachable(channel);
  }
  return `/templates/${channelSubPath}/${id}`;
}

/**
 * Identify function for now.
 * @param definition
 * @returns
 */
export function messageTemplateDefinitionToDraft(
  definition: MessageTemplateResourceDefinition,
): MessageTemplateResourceDraft {
  return definition;
}

export function messageTemplateDraftToDefinition(
  draft: MessageTemplateResourceDraft,
): Result<MessageTemplateResourceDefinition, Error> {
  return ok(draft);
}
