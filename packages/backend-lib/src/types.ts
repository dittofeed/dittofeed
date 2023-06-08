import { Journey, Segment, UserProperty } from "@prisma/client";
import { Static, Type } from "@sinclair/typebox";
import {
  EventType,
  JourneyDefinition,
  Nullable,
  SegmentDefinition,
  UserPropertyDefinition,
} from "isomorphic-lib/src/types";

export * from "isomorphic-lib/src/types";

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

export enum InternalEventType {
  MessageSent = "DFInternalMessageSent",
  BadWorkspaceConfiguration = "DFBadWorkspaceConfiguration",
  MessageFailure = "DFMessageFailure",
  MessageSkipped = "DFMessageSkipped",
  SegmentBroadcast = "DFSegmentBroadcast",
  SubscriptionChange = "DFSubscriptionChange",
  EmailDropped = "DFEmailDropped",
  EmailDelivered = "DFEmailDelivered",
  EmailOpened = "DFEmailOpened",
  EmailClicked = "DFEmailClicked",
  EmailBounced = "DFEmailBounced",
  EmailMarkedSpam = "DFEmailMarkedSpam",
}

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

export enum SubscriptionChange {
  Subscribe = "Subscribe",
  Unsubscribe = "Unsubscribe",
}

export const DecodedJwt = Type.Object({
  sub: Type.String(),
  email: Type.String(),
  email_verified: Type.Boolean(),
  picture: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  nickname: Type.Optional(Type.String()),
});

export type DecodedJwt = Static<typeof DecodedJwt>;

enum SendgridEventType {
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
  custom_args: Type.Optional(Type.Record(Type.String(), Type.String())),
  reason: Type.Optional(Type.String()),
  pool: Type.Optional(
    Type.Object({
      id: Type.Number(),
      name: Type.String(),
    })
  ),
});
// body: [
//   {
//     "email": "max@dittofeed.com",
//     "event": "delivered",
//     "ip": "149.72.154.232",
//     "journeyId": "7992332a-3488-42df-a7e8-2461eadbe41f",
//     "messageId": "4240a362-b20e-4fd3-84d0-ddf80f4d6489",
//     "nodeId": "5e590915-3df6-4f09-8e65-9e005263da65",
//     "response": "250 2.0.0 OK  1686246821 f38-20020a05622a1a2600b003f740365ab1si965549qtb.261 - gsmtp",
//     "runId": "7671592d-e453-4d01-bd6c-4db75c5256de",
//     "sg_event_id": "ZGVsaXZlcmVkLTAtMjk3NjQzNzctQTZGaWx3YUFSX1dtX1ZUQ0VGcWxfdy0w",
//     "sg_message_id": "A6FilwaAR_Wm_VTCEFql_w.filterdrecv-66949dbc98-fvstg-1-648215A4-1D.0",
//     "smtp-id": "<A6FilwaAR_Wm_VTCEFql_w@geopod-ismtpd-2>",
//     "templateId": "7c854d3b-14c0-454b-883c-5a00dbade6fd",
//     "timestamp": 1686246821,
//     "tls": 1,
//     "userId": "0ca50ddc-e32e-4c32-b6e4-f03a03daf656",
//     "workspaceId": "024f3d0a-8eee-11ed-a1eb-0242ac120002"
//   }
// ]

export type SendgridEvent = Static<typeof SendgridEvent>;
