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
  traits: Type.Object(Type.Record(Type.String(), Type.Any())),
});

export const SegmentIOTrackEvent = Type.Object({
  properties: Type.Object(Type.Record(Type.String(), Type.Any())),
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
