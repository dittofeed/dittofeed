import { ChannelType } from "isomorphic-lib/src/types";

import { ResourceType } from "./types";

function getTemplateChannelPath(channel: ChannelType): string {
  switch (channel) {
    case ChannelType.Email:
      return "email";
    case ChannelType.Sms:
      return "sms";
    case ChannelType.MobilePush:
      return "mobile-push";
    case ChannelType.Webhook:
      return "webhook";
  }
}

export function getResourceUrl(
  resourceType: ResourceType,
  resourceId: string,
  options?: { channel?: ChannelType },
): string {
  switch (resourceType) {
    case ResourceType.Segment:
      return `/segments/v1?id=${resourceId}`;
    case ResourceType.SubscriptionGroup:
      return `/subscription-groups/${resourceId}`;
    case ResourceType.MessageTemplate: {
      if (!options?.channel) {
        throw new Error("Channel required for message template URL");
      }
      const channelPath = getTemplateChannelPath(options.channel);
      return `/templates/${channelPath}/${resourceId}`;
    }
    case ResourceType.Journey:
      return `/journeys/v2?id=${resourceId}`;
  }
}
