import { ChannelType } from "./types";

export const WORKSPACE_ID_HEADER = "df-workspace-id" as const;
export const SUBSRIPTION_GROUP_ID_HEADER = "df-subscription-group-id" as const;
export const UNAUTHORIZED_PAGE = "/404" as const;
export const SINGLE_TENANT_LOGIN_PAGE = "/auth/single-tenant" as const;
export const WAITING_ROOM_PAGE = "/waiting-room" as const;
export const EMAIL_NOT_VERIFIED_PAGE = "/waiting-room" as const;
export const SUBSCRIPTION_MANAGEMENT_PAGE =
  "/public/subscription-management" as const;
export const DEBUG_USER_ID1 = "1b9858de-907d-493f-a067-b3c8effecb0b" as const;
export const SUBSCRIPTION_SECRET_NAME = "subscription-key" as const;
export const TWILIO_SECRET_NAME = "twilio-key" as const;
export const SENDGRID_WEBHOOK_SECRET_NAME = "sendgrid-webhook" as const;
export const SENDGRID_SECRET = "sendgrid" as const;
export const FCM_SECRET_NAME = "fcm-key" as const;

export const CHANNEL_NAMES: Record<ChannelType, string> = {
  [ChannelType.Sms]: "SMS",
  [ChannelType.Email]: "Email",
  [ChannelType.MobilePush]: "Push Notification",
};
