import { ChannelType, SmsProviderType, SmsTemplateResource } from "./types";

export function defaultSmsDefinition(): SmsTemplateResource {
  return {
    type: ChannelType.Sms,
    body: "Example message to {{ user.phone }}",
  };
}

export const SmsProviderTypeSet = new Set<string>(
  Object.values(SmsProviderType),
);

export function isSmsProviderType(s: unknown): s is SmsProviderType {
  if (typeof s !== "string") return false;
  return SmsProviderTypeSet.has(s);
}
