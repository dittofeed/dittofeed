import {
  ChannelType,
  MobilePushProviderType,
  MobilePushTemplateResource,
} from "./types";

export function defaultMobilePushDefinition(): MobilePushTemplateResource {
  return {
    type: ChannelType.MobilePush,
    title: "Example title",
    body: "Example message to {{ user.firstName }}",
  };
}

export const MobilePushProviderTypeSet = new Set<string>(
  Object.values(MobilePushProviderType),
);

export function isMobilePushProviderType(
  s: unknown,
): s is MobilePushProviderType {
  if (typeof s !== "string") return false;
  return MobilePushProviderTypeSet.has(s);
}
