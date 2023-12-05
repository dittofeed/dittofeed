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

export const SendgridEvent = Type.Intersect([
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
      })
    ),
  }),
  Type.Record(Type.String(), Type.String()),
]);

export type SendgridEvent = Static<typeof SendgridEvent>;

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
