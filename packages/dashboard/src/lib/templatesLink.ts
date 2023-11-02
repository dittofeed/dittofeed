import { ChannelType } from "isomorphic-lib/src/types";

export function getTemplatesLink({
  channel,
  id,
}: {
  channel: ChannelType;
  id: string;
}) {
  let messageType: string;
  switch (channel) {
    case ChannelType.Email:
      messageType = "email";
      break;
    case ChannelType.MobilePush:
      messageType = "mobile-push";
      break;
    case ChannelType.Sms:
      messageType = "sms";
      break;
  }
  return `/templates/${messageType}/${id}`;
}
