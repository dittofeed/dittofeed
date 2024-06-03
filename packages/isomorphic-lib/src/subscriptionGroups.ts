import { ChannelType, SavedSubscriptionGroupResource } from "./types";

export function getDefaultSubscriptionGroup({
  channel,
  subscriptionGroups,
}: {
  channel: ChannelType;
  subscriptionGroups: SavedSubscriptionGroupResource[];
}): SavedSubscriptionGroupResource | null {
  const forChannel = subscriptionGroups.filter((sg) => sg.channel === channel);
  forChannel.sort((a, b) => a.createdAt - b.createdAt);
  return forChannel[0] ?? null;
}
