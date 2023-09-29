import { DBChannelType } from "@prisma/client";

import { ChannelType } from "./types";

export const DB_TO_CHANNEL: Record<DBChannelType, ChannelType> = {
  [DBChannelType.Email]: ChannelType.Email,
  [DBChannelType.MobilePush]: ChannelType.MobilePush,
  [DBChannelType.Sms]: ChannelType.Sms,
};

export const CHANNEL_TO_DB: Record<ChannelType, DBChannelType> = {
  [ChannelType.Email]: DBChannelType.Email,
  [ChannelType.MobilePush]: DBChannelType.MobilePush,
  [ChannelType.Sms]: DBChannelType.Sms,
};
