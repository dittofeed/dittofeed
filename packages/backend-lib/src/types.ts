import {
  Integration,
  Journey,
  Prisma,
  Segment,
  UserProperty,
} from "@prisma/client";
import { Static, Type } from "@sinclair/typebox";
import {
  EventType,
  IntegrationDefinition,
  JourneyDefinition,
  Nullable,
  SegmentDefinition,
  UserPropertyDefinition,
} from "isomorphic-lib/src/types";
import { Overwrite } from "utility-types";

export * from "isomorphic-lib/src/types";

export enum NodeEnvEnum {
  Development = "development",
  Test = "test",
  Production = "production",
}

export const NodeEnv = Type.Enum(NodeEnvEnum);

export enum KafkaMessageTypes {
  JSON = "0",
}

export interface EnrichedSegment extends Omit<Segment, "definition"> {
  definition: SegmentDefinition;
}

export interface EnrichedJourney extends Omit<Journey, "definition"> {
  definition: JourneyDefinition;
}

export interface EnrichedUserProperty extends Omit<UserProperty, "definition"> {
  definition: UserPropertyDefinition;
}

export interface ComputedPropertyAssignment {
  workspace_id: string;
  user_id: string;
  type: "user_property" | "segment";
  computed_property_id: string;
  segment_value: boolean;
  user_property_value: string;
  processed_for: string;
  processed_for_type: string;
}

export const ComputedAssignment = Type.Object({
  workspace_id: Type.String(),
  computed_property_id: Type.String(),
  user_id: Type.String(),
  type: Type.Union([Type.Literal("segment"), Type.Literal("user_property")]),
  latest_segment_value: Type.Boolean(),
  latest_user_property_value: Type.String(),
  max_assigned_at: Type.String(),
  processed_for: Type.String(),
  processed_for_type: Type.String(),
});

export type ComputedAssignment = Static<typeof ComputedAssignment>;

export const UserEvent = Type.Object({
  workspace_id: Type.String(),
  event_type: Type.Enum(EventType),
  user_id: Nullable(Type.String()),
  anonymous_id: Nullable(Type.String()),
  user_or_anonymous_id: Type.String(),
  message_id: Type.String(),
  event_time: Type.String(),
  processing_time: Type.String(),
  message_raw: Type.String(),
  event: Type.String(),
});

export type UserEvent = Static<typeof UserEvent>;

export const SegmentIOIdentifyEvent = Type.Object({
  traits: Type.Record(Type.String(), Type.Any()),
});

export const SegmentIOTrackEvent = Type.Object({
  properties: Type.Record(Type.String(), Type.Any()),
});

export const SegmentIOEvent = Type.Union([
  SegmentIOIdentifyEvent,
  SegmentIOTrackEvent,
]);

export type SegmentIOEvent = Static<typeof SegmentIOEvent>;

export * from "@prisma/client";

export const KafkaSaslMechanism = Type.Union([
  Type.Literal("plain"),
  Type.Literal("scram-sha-256"),
  Type.Literal("scram-sha-512"),
]);

export type KafkaSaslMechanism = Static<typeof KafkaSaslMechanism>;

export const WriteMode = Type.Union([
  Type.Literal("kafka"),
  Type.Literal("ch-async"),
  Type.Literal("ch-sync"),
]);

export type WriteMode = Static<typeof WriteMode>;

export const AuthMode = Type.Union([
  Type.Literal("anonymous"),
  Type.Literal("multi-tenant"),
  Type.Literal("single-tenant"),
]);

export type AuthMode = Static<typeof AuthMode>;

export const LogLevel = Type.Union([
  Type.Literal("fatal"),
  Type.Literal("error"),
  Type.Literal("warn"),
  Type.Literal("info"),
  Type.Literal("debug"),
  Type.Literal("trace"),
  Type.Literal("silent"),
]);

export type LogLevel = Static<typeof LogLevel>;

export const DecodedJwt = Type.Object({
  sub: Type.String(),
  email: Type.String(),
  email_verified: Type.Boolean(),
  picture: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  nickname: Type.Optional(Type.String()),
});

export type DecodedJwt = Static<typeof DecodedJwt>;

export enum TwilioMessageStatus {
  Queued = "queued",
  Sending = "sending",
  Sent = "sent",
  Failed = "failed",
  Delivered = "delivered",
  Undelivered = "undelivered",
  Receiving = "receiving",
  Received = "received",
  Accepted = "accepted",
  Scheduled = "scheduled",
  Read = "read",
  PartiallyDelivered = "partially_delivered",
  Canceled = "canceled",
}

export const TwilioEventSms = Type.Object({
  SmsSid: Type.String(),
  MessagingServiceSid: Type.String(),
  SmsStatus: Type.Enum(TwilioMessageStatus),
  Body: Type.Optional(Type.String()),
  To: Type.String(),
  MessageSid: Type.String(),
  AccountSid: Type.String(),
  From: Type.String(),
  ApiVersion: Type.String(),
});

export type TwilioInboundSchema = Static<typeof TwilioEventSms>;

export enum AmazonSesNotificationType {
  Bounce = "Bounce",
  Complaint = "Complaint",
  Delivery = "Delivery",
  Send = "Send",
  Reject = "Reject",
  Open = "Open",
  Click = "Click",
}

export enum AmazonSesBounceType {
  Undetermined = "Undetermined",
  Permanent = "Permanent",
  Transient = "Transient",
}

export enum AmazonSesBounceSubType {
  Undetermined = "Undetermined",
  General = "General",
  NoEmail = "NoEmail",
  Suppressed = "Suppressed",
  OnAccountSuppressionList = "OnAccountSuppressionList",
  MailboxFull = "MailboxFull",
  MessageTooLarge = "MessageTooLarge",
  ContentRejected = "ContentRejected",
  AttachmentRejected = "AttachmentRejected",
}

export enum AmazonSesComplaintSubType {
  Abuse = "abuse",
  AuthFailure = "auth-failure",
  Fraud = "fraud",
  NotSpam = "not-spam",
  Other = "other",
  Virus = "virus",
}

export const AmazonSesMailData = Type.Object({
  timestamp: Type.String(),
  messageId: Type.String(),
  source: Type.String(),
  sourceArn: Type.String(),
  sourceIp: Type.String(),
  sendingAccountId: Type.String(),
  callerIdentity: Type.String(),
  destination: Type.Array(Type.String()),
  headers: Type.Optional(
    Type.Array(
      Type.Object({
        name: Type.String(),
        value: Type.String(),
      }),
    ),
  ),
  headersTruncated: Type.Optional(Type.Boolean()),
  commonHeaders: Type.Optional(
    Type.Object({
      from: Type.Array(Type.String()),
      to: Type.Array(Type.String()),
      date: Type.String(),
      messageId: Type.String(),
      subject: Type.String(),
    }),
  ),
  tags: Type.Record(Type.String(), Type.Array(Type.String())),
});

export type AmazonSesMailData = Static<typeof AmazonSesMailData>;

export const AmazonSesClickEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Click),
  mail: AmazonSesMailData,
  click: Type.Object({
    ipAddress: Type.String(),
    timestamp: Type.String(),
    userAgent: Type.String(),
    link: Type.String(),
    linkTags: Type.String(), // This type may not be correct
  }),
});

export const AmazonSesOpenEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Open),
  mail: AmazonSesMailData,
  open: Type.Object({
    ipAddress: Type.String(),
    timestamp: Type.String(),
    userAgent: Type.String(),
  }),
});

export const AmazonSesSendEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Send),
  mail: AmazonSesMailData,
});

export const AmazonSesRejectEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Reject),
  mail: AmazonSesMailData,
  reject: Type.Object({
    reason: Type.String(),
  }),
});

export const AmazonSesBounceEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Bounce),
  mail: AmazonSesMailData,
  bounce: Type.Object({
    bounceType: Type.Enum(AmazonSesBounceType),
    bounceSubType: Type.Enum(AmazonSesBounceSubType),
    bouncedRecipients: Type.Array(
      Type.Object({
        emailAddress: Type.String(),
        action: Type.Optional(Type.String()),
        status: Type.Optional(Type.String()),
        diagnosticCode: Type.Optional(Type.String()),
      }),
    ),
    timestamp: Type.String(),
    feedbackId: Type.String(),
    remoteMtaIp: Type.Optional(Type.String()),
    reportingMTA: Type.Optional(Type.String()),
  }),
});

export const AmazonSesComplaintEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Complaint),
  mail: AmazonSesMailData,
  complaint: Type.Object({
    complainedRecipients: Type.Array(
      Type.Object({
        email: Type.String(),
      }),
    ),
    timestamp: Type.String(),
    feedbackId: Type.String(),
    complaintSubType: Type.Enum(AmazonSesComplaintSubType),
    userAgent: Type.Optional(Type.String()),
    complaintFeedbackType: Type.Optional(Type.String()),
    arrivalDate: Type.Optional(Type.String()),
  }),
});

export const AmazonSesDeliveryEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Delivery),
  mail: AmazonSesMailData,
  delivery: Type.Object({
    timestamp: Type.String(),
    processingTimeMillis: Type.Integer(),
    recipients: Type.Array(Type.String()),
    smtpResponse: Type.String(),
    reportingMTA: Type.String(),
    remoteMtaIp: Type.String(),
  }),
});

export enum AmazonSNSEventTypes {
  SubscriptionConfirmation = "SubscriptionConfirmation",
  Notification = "Notification",
  UnsubscribeConfirmation = "UnsubscribeConfirmation",
}

export const AmazonSNSSubscriptionEvent = Type.Object({
  Type: Type.Literal(AmazonSNSEventTypes.SubscriptionConfirmation),
  Token: Type.String(),
  TopicArn: Type.String(),
  SubscribeURL: Type.String(),
  Signature: Type.String(),
  SignatureVersion: Type.Union([Type.Literal("1"), Type.Literal("2")]),
  SigningCertURL: Type.String(),
  Message: Type.String(),
  MessageId: Type.String(),
  Timestamp: Type.String(),
});

export type AmazonSNSSubscriptionEvent = Static<
  typeof AmazonSNSSubscriptionEvent
>;

export const AmazonSNSUnsubscribeEvent = Type.Object({
  Type: Type.Literal(AmazonSNSEventTypes.UnsubscribeConfirmation),
  Token: Type.String(),
  TopicArn: Type.String(),
  SubscribeURL: Type.String(),
  Signature: Type.String(),
  SignatureVersion: Type.Union([Type.Literal("1"), Type.Literal("2")]),
  SigningCertURL: Type.String(),
  Message: Type.String(),
  MessageId: Type.String(),
  Timestamp: Type.String(),
});

export type AmazonSNSUnsubscribeEvent = Static<
  typeof AmazonSNSUnsubscribeEvent
>;

export const AmazonSNSNotificationEvent = Type.Object({
  Type: Type.Literal(AmazonSNSEventTypes.Notification),
  Message: Type.String(),
  MessageId: Type.String(),
  Subject: Type.Optional(Type.String()),
  TopicArn: Type.String(),
  Timestamp: Type.String(),
  SignatureVersion: Type.Union([Type.Literal("1"), Type.Literal("2")]),
  Signature: Type.String(),
  SigningCertURL: Type.String(),
  UnsubscribeURL: Type.String(),
});

export const AmazonSesEventPayload = Type.Union([
  AmazonSesBounceEvent,
  AmazonSesClickEvent,
  AmazonSesComplaintEvent,
  AmazonSesDeliveryEvent,
  AmazonSesOpenEvent,
  AmazonSesSendEvent,
]);

export type AmazonSesEventPayload = Static<typeof AmazonSesEventPayload>;

export type AmazonSNSNotificationEvent = Static<
  typeof AmazonSNSNotificationEvent
>;

export const AmazonSNSEvent = Type.Union([
  AmazonSNSNotificationEvent,
  AmazonSNSSubscriptionEvent,
  AmazonSNSUnsubscribeEvent,
]);

export type AmazonSNSEvent = Static<typeof AmazonSNSEvent>;

export enum SendgridEventType {
  Processed = "processed",
  Dropped = "dropped",
  Deferred = "deferred",
  Delivered = "delivered",
  Bounce = "bounce",
  Open = "open",
  Click = "click",
  SpamReport = "spamreport",
  Unsubscribe = "unsubscribe",
  GroupUnsubscribe = "group_unsubscribe",
  GroupResubscribe = "group_resubscribe",
}

export const SendgridEvent = Type.Object({
  email: Type.String(),
  timestamp: Type.Integer(),
  event: Type.Enum(SendgridEventType),
  sg_event_id: Type.String(),
  sg_message_id: Type.String(),
  ip: Type.Optional(Type.String()),
  reason: Type.Optional(Type.String()),
  pool: Type.Optional(
    Type.Object({
      id: Type.Number(),
      name: Type.String(),
    }),
  ),
  workspaceId: Type.Optional(Type.String()),
  runId: Type.Optional(Type.String()),
  messageId: Type.Optional(Type.String()),
  userId: Type.Optional(Type.String()),
  templateId: Type.Optional(Type.String()),
  nodeId: Type.Optional(Type.String()),
  journeyId: Type.Optional(Type.String()),
  anonymousId: Type.Optional(Type.String()),
});

export enum ResendEventType {
  Sent = "email.sent",
  Delivered = "email.delivered",
  DeliveryDelayed = "email.delivery_delayed",
  Complained = "email.complained",
  Bounced = "email.bounced",
  Opened = "email.opened",
  Clicked = "email.clicked",
}

export const ResendEvent = Type.Object({
  created_at: Type.String(),
  data: Type.Object({
    created_at: Type.String(),
    email_id: Type.String(),
    from: Type.String(),
    subject: Type.String(),
    to: Type.Array(Type.String()),
    tags: Type.Object({
      workspaceId: Type.Optional(Type.String()),
      runId: Type.Optional(Type.String()),
      messageId: Type.Optional(Type.String()),
      userId: Type.Optional(Type.String()),
      templateId: Type.Optional(Type.String()),
      journeyId: Type.Optional(Type.String()),
      anonymousId: Type.Optional(Type.String()),
    }),
  }),
  type: Type.Enum(ResendEventType),
});

export enum PostMarkEventType {
  Delivery = "Delivery",
  SpamComplaint = "SpamComplaint",
  Bounce = "Bounce",
  Open = "Open",
  Click = "Click",
}

export const PostMarkEvent = Type.Object({
  MessageStream: Type.String(),
  Tag: Type.String(),
  MessageID: Type.String(),
  Metadata: Type.Record(Type.String(), Type.Any()),
  RecordType: Type.Enum(PostMarkEventType),
  BouncedAt: Type.Optional(Type.String()),
  DeliveredAt: Type.Optional(Type.String()),
  ReceivedAt: Type.Optional(Type.String()),
  workspaceId: Type.Optional(Type.String()),
  runId: Type.Optional(Type.String()),
  messageId: Type.Optional(Type.String()),
  templateId: Type.Optional(Type.String()),
  journeyId: Type.Optional(Type.String()),
});

export type SendgridEvent = Static<typeof SendgridEvent>;

export type ResendEvent = Static<typeof ResendEvent>;

export type PostMarkEvent = Static<typeof PostMarkEvent>;

export type IntegrationCreateDefinition = Omit<
  Overwrite<
    Prisma.IntegrationUncheckedCreateInput,
    {
      definition: IntegrationDefinition;
    }
  >,
  "workspaceId"
>;

export type EnrichedIntegration = Overwrite<
  Integration,
  { definition: IntegrationDefinition }
>;

export const IntegrationResource = Type.Object({
  id: Type.String(),
  name: Type.String(),
  definition: IntegrationDefinition,
  enabled: Type.Boolean(),
  workspaceId: Type.String(),
});

export type IntegrationResource = Static<typeof IntegrationResource>;

export const SavedIntegrationResource = Type.Composite([
  IntegrationResource,
  Type.Object({
    createdAt: Type.Number(),
    updatedAt: Type.Number(),
    definitionUpdatedAt: Type.Number(),
  }),
]);

export type SavedIntegrationResource = Static<typeof SavedIntegrationResource>;
