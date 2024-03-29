import { assertUnreachable } from "./typeAssertions";
import { ChannelType } from "./types";

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
