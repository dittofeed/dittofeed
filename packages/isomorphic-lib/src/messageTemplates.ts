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
  ParsedWebhookeDraftBody,
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

export function messageTemplateDefinitionToDraft(
  definition: MessageTemplateResourceDefinition,
): MessageTemplateResourceDraft {
  if (definition.type !== ChannelType.Webhook) {
    return definition;
  }
  return {
    type: ChannelType.Webhook,
    identifierKey: definition.identifierKey,
    body: JSON.stringify({
      config: definition.config,
      secret: definition.secret,
    }),
  };
}

export function messageTemplateDraftToDefinition(
  draft: MessageTemplateResourceDraft,
): Result<MessageTemplateResourceDefinition, Error> {
  if (draft.type !== ChannelType.Webhook) {
    return ok(draft);
  }
  const body = jsonParseSafe(draft.body);
  if (body.isErr()) {
    return err(body.error);
  }
  const validatedBody = schemaValidateWithErr(
    body.value,
    ParsedWebhookeDraftBody,
  );
  if (validatedBody.isErr()) {
    return err(validatedBody.error);
  }
  return ok({
    ...validatedBody.value,
    type: ChannelType.Webhook,
    identifierKey: draft.identifierKey,
  });
}
