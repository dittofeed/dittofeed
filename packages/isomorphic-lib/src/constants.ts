import {
  ChannelType,
  EmailProviderType,
  InternalEventType,
  JourneyNodeType,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SmsProviderType,
  WorkspaceWideProviders,
} from "./types";

export * from "./constants/headers";

export const UNAUTHORIZED_PAGE = "/404" as const;
export const SINGLE_TENANT_LOGIN_PAGE = "/auth/single-tenant" as const;
export const SUBSCRIPTION_MANAGEMENT_PAGE =
  "/public/subscription-management" as const;
export const DEBUG_USER_ID1 = "1b9858de-907d-493f-a067-b3c8effecb0b" as const;

export enum SecretNames {
  Twilio = "twilio-key",
  Sendgrid = "sendgrid",
  AmazonSes = "amazonses",
  Resend = "resend",
  Postmark = "postmark",
  MailChimp = "mailchimp",
  Fcm = "fcm-key",
  Smtp = "smtp",
  Subscription = "subscription-key",
  Webhook = "webhook-channel",
  SmsTestProvider = "SmsTestProvider",
  EmailTestProvider = "EmailTestProvider",
}

export enum DataSources {
  ManualSegment = "DfManualSegment",
}

export const SMS_PROVIDER_TYPE_TO_SECRET_NAME: Record<SmsProviderType, string> =
  {
    [SmsProviderType.Twilio]: SecretNames.Twilio,
    [SmsProviderType.Test]: SecretNames.SmsTestProvider,
  };

export const EMAIL_PROVIDER_TYPE_TO_SECRET_NAME: Record<
  WorkspaceWideProviders,
  string
> = {
  [EmailProviderType.Sendgrid]: SecretNames.Sendgrid,
  [EmailProviderType.AmazonSes]: SecretNames.AmazonSes,
  [EmailProviderType.Smtp]: SecretNames.Smtp,
  [EmailProviderType.Resend]: SecretNames.Resend,
  [EmailProviderType.PostMark]: SecretNames.Postmark,
  [EmailProviderType.MailChimp]: SecretNames.MailChimp,
  [EmailProviderType.Test]: SecretNames.EmailTestProvider,
};

export const CHANNEL_NAMES: Record<ChannelType, string> = {
  [ChannelType.Sms]: "SMS",
  [ChannelType.Email]: "Email",
  [ChannelType.MobilePush]: "Push Notification",
  [ChannelType.Webhook]: "Webhook",
};

export const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6] as const;

export const ENTRY_TYPES = new Set<string>([
  JourneyNodeType.SegmentEntryNode,
  JourneyNodeType.EventEntryNode,
]);

export const MESSAGE_EVENTS = [
  InternalEventType.MessageSent,
  InternalEventType.MessageFailure,
  InternalEventType.MessageSkipped,
  InternalEventType.BadWorkspaceConfiguration,
  InternalEventType.EmailDelivered,
  InternalEventType.EmailOpened,
  InternalEventType.EmailClicked,
  InternalEventType.EmailDropped,
  InternalEventType.EmailBounced,
  InternalEventType.EmailMarkedSpam,
  InternalEventType.SmsDelivered,
  InternalEventType.SmsFailed,
];

export enum SourceType {
  Webhook = "webhook",
}

export const WORKSPACE_TOMBSTONE_PREFIX = "DfTombstoned";

const ENTRY_ID = "entry";
const INIT_TRAIT_ID = "initTraitId";

export const DEFAULT_SEGMENT_DEFINITION: SegmentDefinition = {
  entryNode: {
    type: SegmentNodeType.And,
    children: [INIT_TRAIT_ID],
    id: ENTRY_ID,
  },
  nodes: [
    {
      type: SegmentNodeType.Trait,
      id: INIT_TRAIT_ID,
      path: "",
      operator: {
        type: SegmentOperatorType.Equals,
        value: "",
      },
    },
  ],
};
