import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Static, Type } from "@sinclair/typebox";
import { InferSelectModel } from "drizzle-orm";
import {
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  DFRequestContext,
  EventType,
  IntegrationDefinition,
  JourneyDefinition,
  JourneyDraft,
  Nullable,
  NullableAndOptional,
  SegmentDefinition,
  UserPropertyDefinition,
  WorkspaceMemberResource,
  WorkspaceMemberRoleResource,
  WorkspaceResource,
} from "isomorphic-lib/src/types";
import { Result } from "neverthrow";
import { type Logger as PinoLogger } from "pino";
import { Overwrite } from "utility-types";

import {
  adminApiKey as dbAdminApiKey,
  broadcast as dbBroadcast,
  componentConfiguration as dbComponentConfiguration,
  computedPropertyPeriod as dbComputedPropertyPeriod,
  DBWorkspaceOccupantType,
  emailProvider as dbEmailProvider,
  integration as dbIntegration,
  journey as dbJourney,
  journeyStatus as dbJourneyStatus,
  messageTemplate as dbMessageTemplate,
  secret as dbSecret,
  segment as dbSegment,
  segmentAssignment as dbSegmentAssignment,
  smsProvider as dbSmsProvider,
  subscriptionGroup as dbSubscriptionGroup,
  userJourneyEvent as dbUserJourneyEvent,
  userProperty as dbUserProperty,
  userPropertyAssignment as dbUserPropertyAssignment,
  workspace as dbWorkspace,
  workspaceMember as dbWorkspaceMember,
  workspaceMemberRole as dbWorkspaceMemberRole,
  workspaceType as dbWorkspaceType,
  writeKey as dbWriteKey,
} from "./db/schema";

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

export type WorkspaceMember = InferSelectModel<typeof dbWorkspaceMember>;

export type WorkspaceMemberRole = InferSelectModel<
  typeof dbWorkspaceMemberRole
>;

export type Segment = InferSelectModel<typeof dbSegment>;

export type SegmentAssignment = InferSelectModel<typeof dbSegmentAssignment>;

export type UserProperty = InferSelectModel<typeof dbUserProperty>;

export type Workspace = InferSelectModel<typeof dbWorkspace>;

export type UserPropertyAssignment = InferSelectModel<
  typeof dbUserPropertyAssignment
>;

export type ComputedPropertyPeriod = InferSelectModel<
  typeof dbComputedPropertyPeriod
>;

export type Journey = InferSelectModel<typeof dbJourney>;

export type Integration = InferSelectModel<typeof dbIntegration>;

export type EmailProvider = InferSelectModel<typeof dbEmailProvider>;

export type SmsProvider = InferSelectModel<typeof dbSmsProvider>;

export type MessageTemplate = InferSelectModel<typeof dbMessageTemplate>;

export type Secret = InferSelectModel<typeof dbSecret>;

export type AdminApiKey = InferSelectModel<typeof dbAdminApiKey>;

export type WriteKey = InferSelectModel<typeof dbWriteKey>;

export type ComponentConfiguration = InferSelectModel<
  typeof dbComponentConfiguration
>;

export type SubscriptionGroup = InferSelectModel<typeof dbSubscriptionGroup>;

export { dbJourneyStatus as JourneyStatus, dbWorkspaceType as WorkspaceType };

export type JourneyInsert = typeof dbJourney.$inferInsert;

export type Broadcast = InferSelectModel<typeof dbBroadcast>;

export type UserJourneyEvent = InferSelectModel<typeof dbUserJourneyEvent>;
export interface EnrichedSegment extends Omit<Segment, "definition"> {
  definition: SegmentDefinition;
}

export type DBWorkspaceOccupantType =
  (typeof DBWorkspaceOccupantType.enumValues)[number];

export interface EnrichedJourney extends Omit<Journey, "definition" | "draft"> {
  definition?: JourneyDefinition;
  draft?: JourneyDraft;
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

export const OpenIdProfile = Type.Object({
  sub: Type.String(),
  email: Type.String(),
  email_verified: Type.Boolean(),
  picture: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  nickname: Type.Optional(Type.String()),
});

export type OpenIdProfile = Static<typeof OpenIdProfile>;

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

export const AmazonSesMailData = Type.Composite([
  Type.Object({
    // These fields are required because we use them for application logic.
    // Otherwise we default to making all fields optional, because we don't want
    // to fail our webhook if they're not present.
    timestamp: Type.String(),
    messageId: Type.String(),
  }),
  Type.Partial(
    Type.Object({
      source: NullableAndOptional(Type.String()),
      sourceArn: NullableAndOptional(Type.String()),
      sourceIp: NullableAndOptional(Type.String()),
      sendingAccountId: NullableAndOptional(Type.String()),
      callerIdentity: NullableAndOptional(Type.String()),
      destination: NullableAndOptional(Type.Array(Type.String())),
      headers: NullableAndOptional(
        Type.Array(
          Type.Partial(
            Type.Object({
              name: NullableAndOptional(Type.String()),
              value: NullableAndOptional(Type.String()),
            }),
          ),
        ),
      ),
      headersTruncated: NullableAndOptional(Type.Boolean()),
      commonHeaders: NullableAndOptional(
        Type.Partial(
          Type.Object({
            from: NullableAndOptional(Type.Array(Type.String())),
            to: NullableAndOptional(Type.Array(Type.String())),
            date: NullableAndOptional(Type.String()),
            messageId: NullableAndOptional(Type.String()),
            subject: NullableAndOptional(Type.String()),
          }),
        ),
      ),
      tags: NullableAndOptional(
        Type.Record(Type.String(), Type.Array(Type.String())),
      ),
    }),
  ),
]);

export type AmazonSesMailData = Static<typeof AmazonSesMailData>;

export const AmazonSesClickEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Click),
  mail: AmazonSesMailData,
  click: Type.Composite([
    Type.Object({
      timestamp: Type.String(),
    }),
    Type.Partial(
      Type.Object({
        ipAddress: NullableAndOptional(Type.String()),
        userAgent: NullableAndOptional(Type.String()),
        link: NullableAndOptional(Type.String()),
        linkTags: NullableAndOptional(Type.String()),
      }),
    ),
  ]),
});

export const AmazonSesOpenEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Open),
  mail: AmazonSesMailData,
  open: Type.Composite([
    Type.Object({
      timestamp: Type.String(),
    }),
    Type.Partial(
      Type.Object({
        ipAddress: NullableAndOptional(Type.String()),
        userAgent: NullableAndOptional(Type.String()),
      }),
    ),
  ]),
});

export const AmazonSesSendEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Send),
  mail: AmazonSesMailData,
});

export const AmazonSesRejectEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Reject),
  mail: AmazonSesMailData,
  reject: Type.Partial(
    Type.Object({
      reason: NullableAndOptional(Type.String()),
    }),
  ),
});

export const AmazonSesBounceEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Bounce),
  mail: AmazonSesMailData,
  bounce: Type.Composite([
    Type.Object({
      timestamp: Type.String(),
    }),

    Type.Partial(
      Type.Object({
        bounceType: NullableAndOptional(Type.Enum(AmazonSesBounceType)),
        bounceSubType: NullableAndOptional(Type.Enum(AmazonSesBounceSubType)),
        bouncedRecipients: NullableAndOptional(
          Type.Array(
            Type.Composite([
              Type.Object({
                emailAddress: Type.String(),
              }),
              Type.Partial(
                Type.Object({
                  action: NullableAndOptional(Type.String()),
                  status: NullableAndOptional(Type.String()),
                  diagnosticCode: NullableAndOptional(Type.String()),
                }),
              ),
            ]),
          ),
        ),
        feedbackId: NullableAndOptional(Type.String()),
        remoteMtaIp: NullableAndOptional(Type.String()),
        reportingMTA: NullableAndOptional(Type.String()),
      }),
    ),
  ]),
});

export type AmazonSesBounceEvent = Static<typeof AmazonSesBounceEvent>;

export const AmazonSesComplaintEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Complaint),
  mail: AmazonSesMailData,
  complaint: Type.Composite([
    Type.Object({
      timestamp: Type.String(),
    }),
    Type.Partial(
      Type.Object({
        complainedRecipients: NullableAndOptional(
          Type.Array(
            Type.Object({
              email: Type.String(),
            }),
          ),
        ),
        feedbackId: NullableAndOptional(Type.String()),
        complaintSubType: NullableAndOptional(
          Type.Enum(AmazonSesComplaintSubType),
        ),
        userAgent: NullableAndOptional(Type.String()),
        complaintFeedbackType: NullableAndOptional(Type.String()),
        arrivalDate: NullableAndOptional(Type.String()),
      }),
    ),
  ]),
});

export type AmazonSesComplaintEvent = Static<typeof AmazonSesComplaintEvent>;

export const AmazonSesDeliveryEvent = Type.Object({
  eventType: Type.Literal(AmazonSesNotificationType.Delivery),
  mail: AmazonSesMailData,
  delivery: Type.Object({
    timestamp: Type.String(),
    processingTimeMillis: NullableAndOptional(Type.Integer()),
    recipients: NullableAndOptional(Type.Array(Type.String())),
    smtpResponse: NullableAndOptional(Type.String()),
    reportingMTA: NullableAndOptional(Type.String()),
    remoteMtaIp: NullableAndOptional(Type.String()),
  }),
});

export type AmazonSesDeliveryEvent = Static<typeof AmazonSesDeliveryEvent>;

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

export const AmazonSesEventPayload = Type.Union([
  AmazonSesBounceEvent,
  AmazonSesClickEvent,
  AmazonSesComplaintEvent,
  AmazonSesDeliveryEvent,
  AmazonSesOpenEvent,
  AmazonSesSendEvent,
]);

export type AmazonSesEventPayload = Static<typeof AmazonSesEventPayload>;

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

export const MessageMetadataFields = Type.Object({
  workspaceId: Type.Optional(Type.String()),
  runId: Type.Optional(Type.String()),
  messageId: Type.Optional(Type.String()),
  userId: Type.Optional(Type.String()),
  templateId: Type.Optional(Type.String()),
  nodeId: Type.Optional(Type.String()),
  journeyId: Type.Optional(Type.String()),
});

export type MessageMetadataFields = Static<typeof MessageMetadataFields>;

export const SendgridEvent = Type.Composite([
  Type.Object({
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
  }),
  MessageMetadataFields,
]);

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
    tags: MessageMetadataFields,
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

export const PostMarkEvent = Type.Composite([
  Type.Object({
    MessageStream: Type.String(),
    Tag: Type.String(),
    MessageID: Type.String(),
    Metadata: Type.Record(Type.String(), Type.Any()),
    RecordType: Type.Enum(PostMarkEventType),
    BouncedAt: Type.Optional(Type.String()),
    DeliveredAt: Type.Optional(Type.String()),
    ReceivedAt: Type.Optional(Type.String()),
  }),
  MessageMetadataFields,
]);

export enum MailChimpEventType {
  Send = "send",
  Delivered = "delivered",
  HardBounce = "hard_bounce",
  Open = "open",
  Click = "click",
  Spam = "spam",
  Unsub = "unsub",
  Reject = "reject",
}

export const MailChimpEvent = Type.Object({
  event: Type.Enum(MailChimpEventType),
  msg: Type.Object({
    metadata: Type.Record(Type.String(), Type.String()),
    email: Type.String(),
    _id: Type.String(),
  }),
  ts: Type.Number(),
  url: Type.Optional(Type.String()),
});

export type MailChimpEvent = Static<typeof MailChimpEvent>;

export type SendgridEvent = Static<typeof SendgridEvent>;

export type ResendEvent = Static<typeof ResendEvent>;

export type PostMarkEvent = Static<typeof PostMarkEvent>;

export type IntegrationCreateDefinition = Omit<
  Overwrite<
    typeof dbIntegration.$inferInsert,
    {
      definition: IntegrationDefinition;
    }
  >,
  "workspaceId" | "id" | "updatedAt" | "createdAt" | "updatedAt"
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

export type Logger = PinoLogger<string>;

export type DittofeedFastifyInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  Logger,
  TypeBoxTypeProvider
>;

export enum RequestContextErrorType {
  Unauthorized = "Unauthorized",
  NotOnboarded = "NotOnboarded",
  EmailNotVerified = "EmailNotVerified",
  ApplicationError = "ApplicationError",
  NotAuthenticated = "NotAuthenticated",
  WorkspaceInactive = "WorkspaceInactive",
}

export interface WorkspaceInactiveError {
  type: RequestContextErrorType.WorkspaceInactive;
  message: string;
  workspace: WorkspaceResource;
}

export enum UnauthorizedActionType {
  Redirect = "Redirect",
}

export interface RedirectAction {
  type: UnauthorizedActionType.Redirect;
  url: string;
}

export enum UnauthorizedReason {
  WorkspaceRequiresPayment = "WorkspaceRequiresPayment",
  LacksPermission = "LacksPermission",
}

export type UnauthorizedAction = RedirectAction;

export interface UnauthorizedError {
  type: RequestContextErrorType.Unauthorized;
  message: string;
  member: WorkspaceMemberResource;
  memberRoles: WorkspaceMemberRoleResource[];
  workspace: WorkspaceResource;
  action: UnauthorizedAction;
  reason: UnauthorizedReason;
}

export interface NotOnboardedError {
  type: RequestContextErrorType.NotOnboarded;
  message: string;
  member: WorkspaceMemberResource;
  memberRoles: WorkspaceMemberRoleResource[];
}

export interface ApplicationError {
  type: RequestContextErrorType.ApplicationError;
  message: string;
}

export interface EmailNotVerifiedError {
  type: RequestContextErrorType.EmailNotVerified;
  email: string;
}

export interface NotAuthenticatedError {
  type: RequestContextErrorType.NotAuthenticated;
}

export type RequestContextError =
  | UnauthorizedError
  | NotOnboardedError
  | ApplicationError
  | EmailNotVerifiedError
  | NotAuthenticatedError
  | WorkspaceInactiveError;

export type RequestContextResult = Result<
  DFRequestContext,
  RequestContextError
>;

export type RequestContextPostProcessor = (
  result: RequestContextResult,
) => Promise<RequestContextResult>;

export const WorkspaceQueueItemType = {
  Workspace: "Workspace",
  Segment: "Segment",
  UserProperty: "UserProperty",
  Integration: "Integration",
  Journey: "Journey",
  Batch: "Batch",
} as const;

export type WorkspaceQueueItemType =
  (typeof WorkspaceQueueItemType)[keyof typeof WorkspaceQueueItemType];

export interface EntireWorkspaceQueueItem {
  id: string;
  type?: typeof WorkspaceQueueItemType.Workspace;
  priority?: number;
  // for backwards compatibility
  maxPeriod?: number;
  period?: number;
  insertedAt?: number; // Number representing insertion order
}

export interface BaseComputedPropertyBatchQueueItem {
  workspaceId: string;
  priority?: number;
  // for backwards compatibility
  maxPeriod?: number;
  period?: number;
  insertedAt?: number; // Number representing insertion order
}

export interface BaseComputedPropertyIndividualQueueItem
  extends BaseComputedPropertyBatchQueueItem {
  id: string;
}

export interface SegmentQueueItem
  extends BaseComputedPropertyIndividualQueueItem {
  type: typeof WorkspaceQueueItemType.Segment;
}

export interface UserPropertyQueueItem
  extends BaseComputedPropertyIndividualQueueItem {
  type: typeof WorkspaceQueueItemType.UserProperty;
}

export interface IntegrationQueueItem
  extends BaseComputedPropertyIndividualQueueItem {
  type: typeof WorkspaceQueueItemType.Integration;
}

export interface JourneyQueueItem
  extends BaseComputedPropertyIndividualQueueItem {
  type: typeof WorkspaceQueueItemType.Journey;
}

export type IndividualComputedPropertyQueueItem =
  | SegmentQueueItem
  | UserPropertyQueueItem
  | IntegrationQueueItem
  | JourneyQueueItem;

export interface BatchComputedPropertyQueueItem
  extends BaseComputedPropertyBatchQueueItem {
  type: typeof WorkspaceQueueItemType.Batch;
  items: IndividualComputedPropertyQueueItem[];
}

export type WorkspaceQueueItem =
  | EntireWorkspaceQueueItem
  | IndividualComputedPropertyQueueItem
  | BatchComputedPropertyQueueItem;
