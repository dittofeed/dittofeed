import { ChannelType } from "./types";

export const CHANNEL_IDENTIFIERS: Record<ChannelType, string> = {
  [ChannelType.Email]: "email",
  [ChannelType.MobilePush]: "deviceToken",
  [ChannelType.Sms]: "phone",
};

export function isChannelType(type: string): type is ChannelType {
  return Object.values(ChannelType).includes(type as ChannelType);
}
