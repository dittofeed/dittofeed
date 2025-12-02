import { ChannelType } from "./types";

export const CHANNEL_IDENTIFIERS: Record<
  Exclude<ChannelType, "Webhook">,
  string
> = {
  [ChannelType.Email]: "email",
  [ChannelType.MobilePush]: "deviceToken",
  [ChannelType.Sms]: "phone",
};

export function isChannelType(type: string): type is ChannelType {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return Object.values(ChannelType).includes(type as ChannelType);
}
