import { ChannelType, EmailProviderType, SmsProviderType } from "./types";

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
export const AMAZONSES_SECRET_NAME = "amazonses" as const;
export const RESEND_SECRET = "sendgrid" as const;
export const POSTMARK_SECRET = "postmark" as const;
export const FCM_SECRET_NAME = "fcm-key" as const;
export const SMTP_SECRET_NAME = "smtp" as const;
export const SMS_PROVIDER_TYPE_TO_SECRET_NAME: Record<SmsProviderType, string> =
  {
    [SmsProviderType.Twilio]: TWILIO_SECRET_NAME,
    [SmsProviderType.Test]: "",
  };

export const EMAIL_PROVIDER_TYPE_TO_SECRET_NAME: Record<
  EmailProviderType,
  string
> = {
  [EmailProviderType.Sendgrid]: SENDGRID_SECRET,
  [EmailProviderType.AmazonSes]: AMAZONSES_SECRET_NAME,
  [EmailProviderType.Smtp]: SMTP_SECRET_NAME,
  [EmailProviderType.Resend]: RESEND_SECRET,
  [EmailProviderType.PostMark]: POSTMARK_SECRET,
  [EmailProviderType.Test]: "",
};

export const CHANNEL_NAMES: Record<ChannelType, string> = {
  [ChannelType.Sms]: "SMS",
  [ChannelType.Email]: "Email",
  [ChannelType.MobilePush]: "Push Notification",
};

export const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6] as const;
