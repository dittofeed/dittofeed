import { Static, TSchema, Type } from "@sinclair/typebox";

export const Nullable = <T extends TSchema>(type: T) =>
  Type.Union([type, Type.Null()]);

export type JSONValue =
  | string
  | number
  | null
  | boolean
  | { [x: string]: JSONValue }
  | JSONValue[];

export enum EventType {
  Identify = "identify",
  Track = "track",
  Page = "page",
  Screen = "screen",
  Group = "group",
  Alias = "alias",
}

export interface SegmentUpdate {
  segmentId: string;
  currentlyInSegment: boolean;
  segmentVersion: number;
}

export enum SegmentOperatorType {
  Within = "Within",
  Equals = "Equals",
  HasBeen = "HasBeen",
}

export enum SegmentHasBeenOperatorComparator {
  GTE = "GTE",
  LT = "LT",
}

export const SegmentHasBeenOperator = Type.Object({
  type: Type.Literal(SegmentOperatorType.HasBeen),
  comparator: Type.Enum(SegmentHasBeenOperatorComparator),
  value: Type.Union([Type.String(), Type.Number()]),
  windowSeconds: Type.Number(),
});

export type SegmentHasBeenOperator = Static<typeof SegmentHasBeenOperator>;

export const SegmentWithinOperator = Type.Object({
  type: Type.Literal(SegmentOperatorType.Within),
  windowSeconds: Type.Number(),
});

export type SegmentWithinOperator = Static<typeof SegmentWithinOperator>;

export const SegmentEqualsOperator = Type.Object({
  type: Type.Literal(SegmentOperatorType.Equals),
  value: Type.Union([Type.String(), Type.Number()]),
});

export type SegmentEqualsOperator = Static<typeof SegmentEqualsOperator>;

export const SegmentOperator = Type.Union([
  SegmentWithinOperator,
  SegmentEqualsOperator,
  SegmentHasBeenOperator,
]);

export type SegmentOperator = Static<typeof SegmentOperator>;

export enum SegmentNodeType {
  Trait = "Trait",
  And = "And",
  Or = "Or",
  Performed = "Performed",
  Broadcast = "Broadcast",
  SubscriptionGroup = "SubscriptionGroup",
}

export const SubscriptionGroupSegmentNode = Type.Object({
  type: Type.Literal(SegmentNodeType.SubscriptionGroup),
  id: Type.String(),
  subscriptionGroupId: Type.String(),
});

export type SubscriptionGroupSegmentNode = Static<
  typeof SubscriptionGroupSegmentNode
>;

export const PerformedSegmentNode = Type.Object({
  type: Type.Literal(SegmentNodeType.Performed),
  id: Type.String(),
  event: Type.String(),
  properties: Type.Optional(
    Type.Array(
      Type.Object({
        path: Type.String(),
        operator: SegmentOperator,
      })
    )
  ),
});

export type PerformedSegmentNode = Static<typeof PerformedSegmentNode>;

export const BroadcastSegmentNode = Type.Object({
  type: Type.Literal(SegmentNodeType.Broadcast),
  id: Type.String(),
});

export type BroadcastSegmentNode = Static<typeof BroadcastSegmentNode>;

export const TraitSegmentNode = Type.Object({
  type: Type.Literal(SegmentNodeType.Trait),
  id: Type.String(),
  path: Type.String(),
  operator: SegmentOperator,
});

export type TraitSegmentNode = Static<typeof TraitSegmentNode>;

export const AndSegmentNode = Type.Object({
  type: Type.Literal(SegmentNodeType.And),
  id: Type.String(),
  children: Type.Array(Type.String()),
});

export type AndSegmentNode = Static<typeof AndSegmentNode>;

export const OrSegmentNode = Type.Object({
  type: Type.Literal(SegmentNodeType.Or),
  id: Type.String(),
  children: Type.Array(Type.String()),
});

export type OrSegmentNode = Static<typeof OrSegmentNode>;

export const SegmentNode = Type.Union([
  TraitSegmentNode,
  AndSegmentNode,
  OrSegmentNode,
  PerformedSegmentNode,
  BroadcastSegmentNode,
  SubscriptionGroupSegmentNode,
]);

export type SegmentNode = Static<typeof SegmentNode>;

export const SegmentDefinition = Type.Object({
  entryNode: SegmentNode,
  nodes: Type.Array(SegmentNode),
});

export type SegmentDefinition = Static<typeof SegmentDefinition>;

export enum UserPropertyDefinitionType {
  Trait = "Trait",
  Id = "Id",
  AnonymousId = "AnonymousId",
}

export const TraitUserPropertyDefinition = Type.Object({
  type: Type.Literal(UserPropertyDefinitionType.Trait),
  path: Type.String(),
});

export type TraitUserPropertyDefinition = Static<
  typeof TraitUserPropertyDefinition
>;

export const IdUserPropertyDefinition = Type.Object({
  type: Type.Literal(UserPropertyDefinitionType.Id),
});

export type IdUserPropertyDefinition = Static<typeof IdUserPropertyDefinition>;

export const AnonymousIdUserPropertyDefinition = Type.Object({
  type: Type.Literal(UserPropertyDefinitionType.AnonymousId),
});

export type AnonymousIdUserPropertyDefinition = Static<
  typeof AnonymousIdUserPropertyDefinition
>;

export const UserPropertyDefinition = Type.Union([
  TraitUserPropertyDefinition,
  IdUserPropertyDefinition,
  AnonymousIdUserPropertyDefinition,
]);

export type UserPropertyDefinition = Static<typeof UserPropertyDefinition>;

export enum JourneyNodeType {
  DelayNode = "DelayNode",
  SegmentSplitNode = "SegmentSplitNode",
  MessageNode = "MessageNode",
  RateLimitNode = "RateLimitNode",
  ExperimentSplitNode = "ExperimentSplitNode",
  ExitNode = "ExitNode",
  EntryNode = "EntryNode",
}

const BaseNode = {
  id: Type.String(),
};

export const EntryNode = Type.Object(
  {
    type: Type.Literal(JourneyNodeType.EntryNode),
    segment: Type.String(),
    child: Type.String(),
  },
  {
    title: "Entry Node",
    description:
      "The first node in a journey, which limits it to a specific segment.",
  }
);

export type EntryNode = Static<typeof EntryNode>;

export enum DelayVariantType {
  Second = "Second",
}

export const SecondsDelayVariant = Type.Object({
  type: Type.Literal(DelayVariantType.Second),
  seconds: Type.Number(),
});

export const DelayVariant = Type.Union([SecondsDelayVariant]);

export const DelayNode = Type.Object(
  {
    ...BaseNode,
    type: Type.Literal(JourneyNodeType.DelayNode),
    variant: DelayVariant,
    child: Type.String(),
  },
  {
    title: "Delay Node",
    description:
      "Delays a users progression through the journey for either a set amount of time, or until a specific date time.",
  }
);

export type DelayNode = Static<typeof DelayNode>;

export const RateLimitNode = Type.Object(
  {
    ...BaseNode,
    type: Type.Literal(JourneyNodeType.RateLimitNode),
  },
  {
    title: "Rate Limit Node",
    description:
      "Used to limit the frequency with which users are contacted by a given Journey.",
  }
);

export type RateLimitNode = Static<typeof RateLimitNode>;

export enum MessageNodeVariantType {
  Email = "Email",
}

export const EmailPayload = Type.Object({
  from: Type.String(),
  to: Type.String(),
  subject: Type.String(),
  body: Type.String(),
});

export type EmailPayload = Static<typeof EmailPayload>;

export const EmailMessageVariant = Type.Object({
  type: Type.Literal(MessageNodeVariantType.Email),
  templateId: Type.String(),
});

export type EmailMessageVariant = Static<typeof EmailMessageVariant>;

export const MessageVariant = Type.Union([EmailMessageVariant]);

export type MessageVariants = Static<typeof MessageVariant>;

export const MessageNode = Type.Object(
  {
    ...BaseNode,
    type: Type.Literal(JourneyNodeType.MessageNode),
    name: Type.Optional(Type.String()),
    variant: MessageVariant,
    child: Type.String(),
  },
  {
    title: "Message Node",
    description: "Used to contact a user on a message channel.",
  }
);

export type MessageNode = Static<typeof MessageNode>;

export enum SegmentSplitVariantType {
  Boolean = "Boolean",
}

// TODO change this to segments, plural
export const BooleanSegmentSplitVariant = Type.Object({
  type: Type.Literal(SegmentSplitVariantType.Boolean),
  segment: Type.String(),
  trueChild: Type.String(),
  falseChild: Type.String(),
});

// Later implement a split on 1 > segments
export const SegmentSplitVariant = Type.Union([BooleanSegmentSplitVariant]);

export const SegmentSplitNode = Type.Object(
  {
    ...BaseNode,
    type: Type.Literal(JourneyNodeType.SegmentSplitNode),
    variant: SegmentSplitVariant,
    name: Type.Optional(Type.String()),
  },
  {
    title: "Segment Split Node",
    description:
      "Used to split users among audiences, based on the behavior and attributes.",
  }
);

export type SegmentSplitNode = Static<typeof SegmentSplitNode>;

export const ExperimentSplitNode = Type.Object(
  {
    ...BaseNode,
    type: Type.Literal(JourneyNodeType.ExperimentSplitNode),
  },
  {
    title: "Experiment Split Node",
    description:
      "Used to split users among experiment paths, to test their effectiveness.",
  }
);

export type ExperimentSplitNode = Static<typeof ExperimentSplitNode>;

export const ExitNode = Type.Object(
  {
    type: Type.Literal(JourneyNodeType.ExitNode),
  },
  {
    title: "Exit Node",
    description:
      "Defines when a user exits a journey. Allows users to re-enter the journey, under some set of conditions.",
  }
);

export type ExitNode = Static<typeof ExitNode>;

export const JourneyBodyNode = Type.Union([
  DelayNode,
  RateLimitNode,
  SegmentSplitNode,
  MessageNode,
  ExperimentSplitNode,
]);

export type JourneyBodyNode = Static<typeof JourneyBodyNode>;

export const JourneyNode = Type.Union([EntryNode, ExitNode, JourneyBodyNode]);

export type JourneyNode = Static<typeof JourneyNode>;

export const JourneyDefinition = Type.Object({
  entryNode: EntryNode,
  exitNode: ExitNode,
  nodes: Type.Array(JourneyBodyNode),
});

export type JourneyDefinition = Static<typeof JourneyDefinition>;

export const SegmentResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  definition: SegmentDefinition,
});

export type SegmentResource = Static<typeof SegmentResource>;

export enum SubscriptionGroupType {
  OptIn = "OptIn",
  OptOut = "OptOut",
}

export const SubscriptionGroupResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  type: Type.Enum(SubscriptionGroupType),
});

export type SubscriptionGroupResource = Static<
  typeof SubscriptionGroupResource
>;

export const UpsertSubscriptionGroupResource = SubscriptionGroupResource;

export type UpsertSubscriptionGroupResource = Static<
  typeof UpsertSubscriptionGroupResource
>;

export const BroadcastResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  segmentId: Type.String(),
  createdAt: Type.Number(),
  triggeredAt: Type.Optional(Type.Number()),
});

export type BroadcastResource = Static<typeof BroadcastResource>;

export const UpsertBroadcastResource = Type.Omit(BroadcastResource, [
  "createdAt",
  "triggeredAt",
]);

export type UpsertBroadcastResource = Static<typeof UpsertBroadcastResource>;

export const UpsertSegmentResource = Type.Intersect([
  Type.Omit(Type.Partial(SegmentResource), ["id"]),
  Type.Pick(SegmentResource, ["id"]),
]);

export type UpsertSegmentResource = Static<typeof UpsertSegmentResource>;

export const DeleteSegmentResponse = Type.String({
  description: "An empty String",
});

export type DeleteSegmentResponse = Static<typeof DeleteSegmentResponse>;

export const DeleteSegmentRequest = Type.Object({
  id: Type.String(),
});

export type DeleteSegmentRequest = Static<typeof DeleteSegmentRequest>;

export const GetEventsRequest = Type.Object({
  workspaceId: Type.String(),
  offset: Type.Number(),
  limit: Type.Number(),
});

export type GetEventsRequest = Static<typeof GetEventsRequest>;

export const Traits = Nullable(Type.Record(Type.String(), Type.Any()));

export type Traits = Static<typeof Traits>;

export const GetEventsResponseItem = Type.Object({
  messageId: Type.String(),
  eventType: Type.String(),
  event: Type.String(),
  userId: Nullable(Type.String()),
  anonymousId: Nullable(Type.String()),
  processingTime: Type.String(),
  eventTime: Type.String(),
  traits: Type.String(),
});

export type GetEventsResponseItem = Static<typeof GetEventsResponseItem>;

export const GetEventsResponse = Type.Object({
  events: Type.Array(GetEventsResponseItem),
  count: Type.Number(),
});

export type GetEventsResponse = Static<typeof GetEventsResponse>;

export enum TemplateResourceType {
  Email = "Email",
}

export const EmailTemplateResource = Type.Object({
  type: Type.Literal(TemplateResourceType.Email),
  workspaceId: Type.String(),
  id: Type.String(),
  name: Type.String(),
  from: Type.String(),
  subject: Type.String(),
  body: Type.String(),
});

export type EmailTemplateResource = Static<typeof EmailTemplateResource>;

export const MessageTemplateResource = Type.Union([EmailTemplateResource]);

export type MessageTemplateResource = Static<typeof MessageTemplateResource>;

export const UpsertMessageTemplateResource = Type.Intersect([
  Type.Omit(Type.Partial(MessageTemplateResource), ["id"]),
  Type.Pick(MessageTemplateResource, ["id"]),
]);

export type UpsertMessageTemplateResource = Static<
  typeof UpsertMessageTemplateResource
>;

export const DeleteMessageTemplateResponse = Type.String({
  description: "An empty String",
});

export type DeleteMessageTemplateResponse = Static<
  typeof DeleteJourneyResponse
>;

export const DeleteMessageTemplateRequest = Type.Object({
  id: Type.String(),
  type: Type.Enum(TemplateResourceType),
});

export type DeleteMessageTemplateRequest = Static<
  typeof DeleteMessageTemplateRequest
>;

export enum CompletionStatus {
  NotStarted = "NotStarted",
  InProgress = "InProgress",
  Successful = "Successful",
  Failed = "failed",
}

export interface NotStartedRequest {
  type: CompletionStatus.NotStarted;
}

export interface InProgressRequest {
  type: CompletionStatus.InProgress;
}

export interface SuccessfulRequest<V> {
  type: CompletionStatus.Successful;
  value: V;
}

export interface FailedRequest<E> {
  type: CompletionStatus.Failed;
  error: E;
}

export type EphemeralRequestStatus<E> =
  | NotStartedRequest
  | InProgressRequest
  | FailedRequest<E>;

export type RequestStatus<V, E> =
  | NotStartedRequest
  | InProgressRequest
  | SuccessfulRequest<V>
  | FailedRequest<E>;

export enum EmailProviderType {
  Sendgrid = "SendGrid",
  Test = "Test",
}

export const TestEmailProvider = Type.Object({
  type: Type.Literal(EmailProviderType.Test),
});

export type TestEmailProvider = Static<typeof TestEmailProvider>;

export const SendgridEmailProvider = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  type: Type.Literal(EmailProviderType.Sendgrid),
  apiKey: Type.String(),
});

export type SendgridEmailProvider = Static<typeof SendgridEmailProvider>;

export const PersistedEmailProvider = Type.Union([SendgridEmailProvider]);

export type PersistedEmailProvider = Static<typeof PersistedEmailProvider>;

export const EmailProviderResource = Type.Union([
  PersistedEmailProvider,
  TestEmailProvider,
]);

export type EmailProviderResource = Static<typeof EmailProviderResource>;

export const UpsertEmailProviderResource = Type.Union([
  Type.Intersect([
    Type.Omit(Type.Partial(PersistedEmailProvider), ["id", "workspaceId"]),
    Type.Pick(PersistedEmailProvider, ["id", "workspaceId"]),
  ]),
  Type.Intersect([
    Type.Omit(Type.Partial(PersistedEmailProvider), ["type", "workspaceId"]),
    Type.Pick(PersistedEmailProvider, ["type", "workspaceId"]),
  ]),
]);

export type UpsertEmailProviderResource = Static<
  typeof UpsertEmailProviderResource
>;

export enum DataSourceVariantType {
  SegmentIO = "SegmentIO",
}

export const SegmentIODataSource = Type.Object({
  type: Type.Literal(DataSourceVariantType.SegmentIO),
  sharedSecret: Type.String(),
});

export const DataSourceConfigurationVariant = Type.Union([SegmentIODataSource]);

export const DataSourceConfigurationResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  variant: DataSourceConfigurationVariant,
});

export type DataSourceConfigurationResource = Static<
  typeof DataSourceConfigurationResource
>;

export const UpsertDataSourceConfigurationResource = Type.Omit(
  DataSourceConfigurationResource,
  ["id"]
);

export type UpsertDataSourceConfigurationResource = Static<
  typeof UpsertDataSourceConfigurationResource
>;

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export const WorkspaceResource = Type.Object({
  id: Type.String(),
  name: Type.String(),
});

export type WorkspaceResource = Static<typeof WorkspaceResource>;

export const DefaultEmailProviderResource = Type.Object({
  workspaceId: Type.String(),
  emailProviderId: Type.String(),
});

export type DefaultEmailProviderResource = Static<
  typeof DefaultEmailProviderResource
>;

export const JourneyResourceStatus = Type.Union([
  Type.Literal("NotStarted"),
  Type.Literal("Running"),
  Type.Literal("Paused"),
]);

export type JourneyResourceStatus = Static<typeof JourneyResourceStatus>;

export const JourneyResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  status: JourneyResourceStatus,
  definition: JourneyDefinition,
});

export type JourneyResource = Static<typeof JourneyResource>;

export const UpsertJourneyResource = Type.Intersect([
  Type.Omit(Type.Partial(JourneyResource), ["id"]),
  Type.Pick(JourneyResource, ["id"]),
]);

export type UpsertJourneyResource = Static<typeof UpsertJourneyResource>;

export const DeleteJourneyResponse = Type.String({
  description: "An empty String",
});

export type DeleteJourneyResponse = Static<typeof DeleteJourneyResponse>;

export const DeleteJourneyRequest = Type.Object({
  id: Type.String(),
});

export type DeleteJourneyRequest = Static<typeof DeleteJourneyRequest>;

export const UserPropertyResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  definition: UserPropertyDefinition,
});

export type UserPropertyResource = Static<typeof UserPropertyResource>;

export const UpsertUserPropertyResource = Type.Intersect([
  Type.Omit(Type.Partial(UserPropertyResource), ["id", "name"]),
  Type.Pick(UserPropertyResource, ["id", "name"]),
]);

export type UpsertUserPropertyResource = Static<
  typeof UpsertUserPropertyResource
>;

export const DeleteUserPropertyResponse = Type.String({
  description: "An empty String",
});

export type DeleteUserPropertyResponse = Static<
  typeof DeleteUserPropertyResponse
>;

export const DeleteUserPropertyRequest = Type.Object({
  id: Type.String(),
});

export type DeleteUserPropertyRequest = Static<
  typeof DeleteUserPropertyRequest
>;

export enum CursorDirectionEnum {
  After = "after",
  Before = "before",
}

export const CursorDirection = Type.Enum(CursorDirectionEnum);

export const GetUsersRequest = Type.Object({
  cursor: Type.Optional(Type.String()),
  segmentId: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number()),
  direction: Type.Optional(CursorDirection),
});

export type GetUsersRequest = Static<typeof GetUsersRequest>;

const GetUsersResponseItem = Type.Object({
  id: Type.String(),
  properties: Type.Record(Type.String(), Type.String()),
  segments: Type.Array(Type.String()),
});

export type GetUsersResponseItem = Static<typeof GetUsersResponseItem>;

export const GetUsersResponse = Type.Object({
  users: Type.Array(GetUsersResponseItem),
  previousCursor: Type.Optional(Type.String()),
  nextCursor: Type.Optional(Type.String()),
});

export type GetUsersResponse = Static<typeof GetUsersResponse>;

export const BadRequestResponse = Type.Object({
  message: Type.String(),
});

export enum SourceControlProviderEnum {
  GitHub = "github",
}

export const SourceControlProvider = Type.Enum(SourceControlProviderEnum);

export const WorkspaceId = Type.String({
  description:
    "Id of the workspace which will receive the segment payload. Defaults to the default workspace id, for single tenant systems",
});

export type WorkspaceId = Static<typeof WorkspaceId>;

export const UserUploadRow = Type.Union([
  Type.Intersect([
    Type.Record(Type.String(), Type.String()),
    Type.Object({
      id: Type.String(),
    }),
  ]),
  Type.Intersect([
    Type.Record(Type.String(), Type.String()),
    Type.Object({
      email: Type.String({ format: "email" }),
    }),
  ]),
]);

export type UserUploadRow = Static<typeof UserUploadRow>;
