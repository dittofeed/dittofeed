import { defaultEmailDefinition } from "isomorphic-lib/src/email";
import { defaultSmsDefinition } from "isomorphic-lib/src/sms";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  EmailContentsType,
  MessageTemplateResourceDefinition,
} from "isomorphic-lib/src/types";
import { DEFAULT_WEBHOOK_DEFINITION } from "isomorphic-lib/src/webhook";

export const DEFAULT_EMAIL_CONTENTS_TYPE = EmailContentsType.LowCode;

export function getDefaultMessageTemplateDefinition(
  channelType: ChannelType,
  emailContentsType?: EmailContentsType,
): MessageTemplateResourceDefinition {
  switch (channelType) {
    case ChannelType.Email:
      return defaultEmailDefinition({
        emailContentsType: emailContentsType ?? DEFAULT_EMAIL_CONTENTS_TYPE,
      });
    case ChannelType.Sms:
      return defaultSmsDefinition();
    case ChannelType.Webhook:
      return DEFAULT_WEBHOOK_DEFINITION;
    case ChannelType.MobilePush:
      throw new Error("Not implemented");
    default:
      assertUnreachable(channelType);
  }
}
