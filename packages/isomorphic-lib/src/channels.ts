import { ChannelType } from "./types";

export const CHANNEL_IDENTIFIERS: Record<ChannelType, string> = {
  [ChannelType.Email]: "email",
  [ChannelType.MobilePush]: "deviceToken",
};
