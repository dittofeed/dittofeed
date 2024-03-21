import { Static, TSchema, Type } from "@sinclair/typebox";
import { Result } from "neverthrow";

export enum JsonResultType {
  Ok = "Ok",
  Err = "Err",
}

export const JsonOk = <T extends TSchema>(type: T) =>
  Type.Object({
    type: Type.Literal(JsonResultType.Ok),
    value: type,
  });

export const JsonErr = <E extends TSchema>(type: E) =>
  Type.Object({
    type: Type.Literal(JsonResultType.Err),
    err: type,
  });

// necessary because neverthrow's result is not json serializable
export const JsonResult = <T extends TSchema, E extends TSchema>(
  resultType: T,
  errorType: E,
) => Type.Union([JsonOk(resultType), JsonErr(errorType)]);

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
  SmsDelivered = "DFSmsDelivered",
  SmsFailed = "DFSmsFailed",
  JourneyNodeProcessed = "DFJourneyNodeProcessed",
}

export enum SubscriptionGroupType {
  OptIn = "OptIn",
  OptOut = "OptOut",
}

export enum ChannelType {
  Email = "Email",
  MobilePush = "MobilePush",
  Sms = "Sms",
}

export const SubscriptionGroupResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  channel: Type.Enum(ChannelType),
  type: Type.Enum(SubscriptionGroupType),
});

export type SubscriptionGroupResource = Static<
  typeof SubscriptionGroupResource
>;

export const SavedSubscriptionGroupResource = Type.Composite([
  SubscriptionGroupResource,
  Type.Object({
    createdAt: Type.Number(),
    updatedAt: Type.Number(),
  }),
]);

export type SavedSubscriptionGroupResource = Static<
  typeof SavedSubscriptionGroupResource
>;

export interface SegmentUpdate {
  type: "segment";
  segmentId: string;
  currentlyInSegment: boolean;
  segmentVersion: number;
}

export interface UserPropertyUpdate {
  type: "user_property";
  userPropertyId: string;
  value: string;
  userPropertyVersion: number;
}

export type ComputedPropertyUpdate = SegmentUpdate | UserPropertyUpdate;

export enum SegmentOperatorType {
  Within = "Within",
  Equals = "Equals",
  HasBeen = "HasBeen",
  NotEquals = "NotEquals",
  Exists = "Exists",
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

export const ExistsOperator = Type.Object({
  type: Type.Literal(SegmentOperatorType.Exists),
});

export type ExistsOperator = Static<typeof ExistsOperator>;

export const SegmentEqualsOperator = Type.Object({
  type: Type.Literal(SegmentOperatorType.Equals),
  value: Type.Union([Type.String(), Type.Number()]),
});

export type SegmentEqualsOperator = Static<typeof SegmentEqualsOperator>;

export const SegmentNotEqualsOperator = Type.Object({
  type: Type.Literal(SegmentOperatorType.NotEquals),
  value: Type.Union([Type.String(), Type.Number()]),
});

export type SegmentNotEqualsOperator = Static<typeof SegmentNotEqualsOperator>;

export const SegmentOperator = Type.Union([
  SegmentWithinOperator,
  SegmentEqualsOperator,
  SegmentNotEqualsOperator,
  SegmentHasBeenOperator,
  ExistsOperator,
]);

export type SegmentOperator = Static<typeof SegmentOperator>;

export enum SegmentNodeType {
  Trait = "Trait",
  And = "And",
  Or = "Or",
  Performed = "Performed",
  LastPerformed = "LastPerformed",
  Broadcast = "Broadcast",
  SubscriptionGroup = "SubscriptionGroup",
  Email = "Email",
}

export const SubscriptionGroupSegmentNode = Type.Object({
  type: Type.Literal(SegmentNodeType.SubscriptionGroup),
  id: Type.String(),
  subscriptionGroupId: Type.String(),
  subscriptionGroupType: Type.Enum(SubscriptionGroupType),
});

export type SubscriptionGroupSegmentNode = Static<
  typeof SubscriptionGroupSegmentNode
>;

export enum RelationalOperators {
  Equals = "=",
  GreaterThanOrEqual = ">=",
  LessThan = "<",
}

export const PerformedSegmentNode = Type.Object({
  type: Type.Literal(SegmentNodeType.Performed),
  id: Type.String(),
  event: Type.String(),
  times: Type.Optional(Type.Number()),
  timesOperator: Type.Optional(Type.Enum(RelationalOperators)),
  withinSeconds: Type.Optional(Type.Number()),
  properties: Type.Optional(
    Type.Array(
      Type.Object({
        path: Type.String(),
        operator: SegmentOperator,
      }),
    ),
  ),
});

export type PerformedSegmentNode = Static<typeof PerformedSegmentNode>;

// Order of this union is important, as it determines the order of the listed events in the UI
export const EmailEvent = Type.Union([
  Type.Literal(InternalEventType.MessageSent),
  Type.Literal(InternalEventType.EmailDropped),
  Type.Literal(InternalEventType.EmailDelivered),
  Type.Literal(InternalEventType.EmailOpened),
  Type.Literal(InternalEventType.EmailClicked),
  Type.Literal(InternalEventType.EmailBounced),
  Type.Literal(InternalEventType.EmailMarkedSpam),
]);

export type EmailEvent = Static<typeof EmailEvent>;

export const EmailEventList: string[] = EmailEvent.anyOf.map((e) => e.const);

export const EmailSegmentNode = Type.Object({
  type: Type.Literal(SegmentNodeType.Email),
  id: Type.String(),
  event: EmailEvent,
  times: Type.Optional(Type.Number()),
  templateId: Type.String(),
});

export type EmailSegmentNode = Static<typeof EmailSegmentNode>;

export const LastPerformedSegmentNode = Type.Object({
  type: Type.Literal(SegmentNodeType.LastPerformed),
  id: Type.String(),
  event: Type.String(),
  whereProperties: Type.Optional(
    Type.Array(
      Type.Object({
        path: Type.String(),
        operator: SegmentOperator,
      }),
      {
        description:
          "Used to select which events are eligible to be considered.",
      },
    ),
  ),
  hasProperties: Type.Array(
    Type.Object({
      path: Type.String(),
      operator: SegmentOperator,
    }),
    {
      description:
        "Used to evaluate whether the user is in the segment based on the properties of the selected event.",
    },
  ),
});

export type LastPerformedSegmentNode = Static<typeof LastPerformedSegmentNode>;

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
  LastPerformedSegmentNode,
  EmailSegmentNode,
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
  Performed = "Performed",
  Group = "Group",
  AnyOf = "AnyOf",
  PerformedMany = "PerformedMany",
}

export const TraitUserPropertyDefinition = Type.Object({
  // set to optional for backwards compatibility
  id: Type.Optional(Type.String()),
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

export const PerformedUserPropertyDefinition = Type.Object({
  // set to optional for backwards compatibility
  id: Type.Optional(Type.String()),
  type: Type.Literal(UserPropertyDefinitionType.Performed),
  event: Type.String(),
  path: Type.String(),
});

export type PerformedUserPropertyDefinition = Static<
  typeof PerformedUserPropertyDefinition
>;

export const PerformedManyUserPropertyDefinition = Type.Object({
  id: Type.Optional(Type.String()),
  type: Type.Literal(UserPropertyDefinitionType.PerformedMany),
  or: Type.Array(Type.Object({ event: Type.String() })),
});

export type PerformedManyUserPropertyDefinition = Static<
  typeof PerformedManyUserPropertyDefinition
>;

export const UserPropertyAssignments = Type.Record(Type.String(), Type.Any());

export type UserPropertyAssignments = Static<typeof UserPropertyAssignments>;

export const ParsedPerformedManyValueItem = Type.Object({
  event: Type.String(),
  timestamp: Type.String(),
  properties: UserPropertyAssignments,
});

export type ParsedPerformedManyValueItem = Static<
  typeof ParsedPerformedManyValueItem
>;

export const PerformedManyValueItem = Type.Object({
  event: Type.String(),
  timestamp: Type.String(),
  properties: Type.String(),
});

export type PerformedManyValueItem = Static<typeof PerformedManyValueItem>;

export const PerformedManyValue = Type.Array(PerformedManyValueItem);

export type PerformedManyValue = Static<typeof PerformedManyValue>;

export const AnyOfUserPropertyDefinition = Type.Object({
  id: Type.String(),
  type: Type.Literal(UserPropertyDefinitionType.AnyOf),
  children: Type.Array(Type.String()),
});

export type AnyOfUserPropertyDefinition = Static<
  typeof AnyOfUserPropertyDefinition
>;

export const GroupParentUserPropertyDefinitions = Type.Union([
  AnyOfUserPropertyDefinition,
]);

export type GroupParentUserPropertyDefinitions = Static<
  typeof GroupParentUserPropertyDefinitions
>;

export const LeafUserPropertyDefinition = Type.Union([
  TraitUserPropertyDefinition,
  PerformedUserPropertyDefinition,
]);

export type LeafUserPropertyDefinition = Static<
  typeof LeafUserPropertyDefinition
>;

export const GroupChildrenUserPropertyDefinitions = Type.Union([
  GroupParentUserPropertyDefinitions,
  LeafUserPropertyDefinition,
]);

export type GroupChildrenUserPropertyDefinitions = Static<
  typeof GroupChildrenUserPropertyDefinitions
>;

export const GroupUserPropertyDefinition = Type.Object({
  type: Type.Literal(UserPropertyDefinitionType.Group),
  entry: Type.String(),
  nodes: Type.Array(GroupChildrenUserPropertyDefinitions),
});

export type GroupUserPropertyDefinition = Static<
  typeof GroupUserPropertyDefinition
>;

export const UserPropertyDefinition = Type.Union([
  IdUserPropertyDefinition,
  AnonymousIdUserPropertyDefinition,
  GroupUserPropertyDefinition,
  LeafUserPropertyDefinition,
  PerformedManyUserPropertyDefinition,
]);

export type UserPropertyDefinition = Static<typeof UserPropertyDefinition>;

export enum JourneyNodeType {
  DelayNode = "DelayNode",
  SegmentSplitNode = "SegmentSplitNode",
  MessageNode = "MessageNode",
  RateLimitNode = "RateLimitNode",
  ExperimentSplitNode = "ExperimentSplitNode",
  ExitNode = "ExitNode",
  // Inconsistent naming is for backwards compatibility.
  SegmentEntryNode = "EntryNode",
  EventEntryNode = "EventEntryNode",
  WaitForNode = "WaitForNode",
}

const BaseNode = {
  id: Type.String(),
};

export const SegmentEntryNode = Type.Object(
  {
    type: Type.Literal(JourneyNodeType.SegmentEntryNode),
    segment: Type.String(),
    child: Type.String(),
  },
  {
    title: "Segment Entry Node",
    description:
      "The first node in a journey, which limits it to a specific segment.",
  },
);

export type SegmentEntryNode = Static<typeof SegmentEntryNode>;

export const EventEntryNode = Type.Object({
  type: Type.Literal(JourneyNodeType.EventEntryNode),
  event: Type.String(),
  child: Type.String(),
});

export type EventEntryNode = Static<typeof EventEntryNode>;

export const EntryNode = Type.Union([SegmentEntryNode, EventEntryNode]);

export type EntryNode = Static<typeof EntryNode>;

export const WaitForSegmentChild = Type.Object({
  id: Type.String(),
  segmentId: Type.String(),
});

export type WaitForSegmentChild = Static<typeof WaitForSegmentChild>;

export const WaitForNode = Type.Object(
  {
    ...BaseNode,
    type: Type.Literal(JourneyNodeType.WaitForNode),
    timeoutSeconds: Type.Number(),
    timeoutChild: Type.String(),
    segmentChildren: Type.Array(WaitForSegmentChild),
  },
  {
    title: "Wait For Node",
    description:
      "A node which waits for a user to enter a segment before progressing.",
  },
);

export type WaitForNode = Static<typeof WaitForNode>;

export enum DelayVariantType {
  Second = "Second",
  LocalTime = "LocalTime",
}

export const SecondsDelayVariant = Type.Object({
  type: Type.Literal(DelayVariantType.Second),
  seconds: Type.Number(),
});

export type SecondsDelayVariant = Static<typeof SecondsDelayVariant>;

export const AllowedDayIndices = Type.Union([
  Type.Literal(0),
  Type.Literal(1),
  Type.Literal(2),
  Type.Literal(3),
  Type.Literal(4),
  Type.Literal(5),
  Type.Literal(6),
]);

export type AllowedDayIndices = Static<typeof AllowedDayIndices>;

export const LocalTimeDelayVariant = Type.Object({
  type: Type.Literal(DelayVariantType.LocalTime),
  minute: Type.Optional(Type.Number()),
  hour: Type.Number(),
  allowedDaysOfWeek: Type.Optional(Type.Array(AllowedDayIndices)),
  // TODO support additional time units
});

export type LocalTimeDelayVariant = Static<typeof LocalTimeDelayVariant>;

export type LocalTimeDelayVariantFields = Omit<LocalTimeDelayVariant, "type">;

export const DelayVariant = Type.Union([
  SecondsDelayVariant,
  LocalTimeDelayVariant,
]);

export type DelayVariant = Static<typeof DelayVariant>;

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
  },
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
  },
);

export type RateLimitNode = Static<typeof RateLimitNode>;

export const EmailMessageVariant = Type.Object({
  type: Type.Literal(ChannelType.Email),
  templateId: Type.String(),
});

export type EmailMessageVariant = Static<typeof EmailMessageVariant>;

export const MobilePushMessageVariant = Type.Object({
  type: Type.Literal(ChannelType.MobilePush),
  templateId: Type.String(),
});

export type MobilePushMessageVariant = Static<typeof MobilePushMessageVariant>;

export const SmsMessageVariant = Type.Object({
  type: Type.Literal(ChannelType.Sms),
  templateId: Type.String(),
});

export type SmsMessageVariant = Static<typeof SmsMessageVariant>;

export const MessageVariant = Type.Union([
  EmailMessageVariant,
  MobilePushMessageVariant,
  SmsMessageVariant,
]);

export type MessageVariants = Static<typeof MessageVariant>;

export const MessageNode = Type.Object(
  {
    ...BaseNode,
    type: Type.Literal(JourneyNodeType.MessageNode),
    name: Type.Optional(Type.String()),
    subscriptionGroupId: Type.Optional(Type.String()),
    variant: MessageVariant,
    child: Type.String(),
  },
  {
    title: "Message Node",
    description: "Used to contact a user on a message channel.",
  },
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
  },
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
  },
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
  },
);

export type ExitNode = Static<typeof ExitNode>;

export const JourneyBodyNode = Type.Union([
  DelayNode,
  RateLimitNode,
  SegmentSplitNode,
  MessageNode,
  ExperimentSplitNode,
  WaitForNode,
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
  subscriptionGroupId: Type.Optional(Type.String()),
  updatedAt: Type.Number(),
  lastRecomputed: Type.Optional(Type.Number()),
});

export type SegmentResource = Static<typeof SegmentResource>;

export const SavedSegmentResource = Type.Composite([
  SegmentResource,
  Type.Object({
    createdAt: Type.Number(),
    updatedAt: Type.Number(),
    definitionUpdatedAt: Type.Number(),
  }),
]);

export type SavedSegmentResource = Static<typeof SavedSegmentResource>;

export const UpsertSubscriptionGroupResource = SubscriptionGroupResource;

export type UpsertSubscriptionGroupResource = Static<
  typeof UpsertSubscriptionGroupResource
>;

export const BroadcastResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  segmentId: Type.Optional(Type.String()),
  journeyId: Type.Optional(Type.String()),
  messageTemplateId: Type.Optional(Type.String()),
  status: Type.Union([
    Type.Literal("NotStarted"),
    Type.Literal("InProgress"),
    Type.Literal("Triggered"),
  ]),
  createdAt: Type.Number(),
  updatedAt: Type.Number(),
  triggeredAt: Type.Optional(Type.Number()),
});

export type BroadcastResource = Static<typeof BroadcastResource>;

export const UpdateBroadcastRequest = Type.Object({
  workspaceId: Type.String(),
  id: Type.String(),
  name: Type.Optional(Type.String()),
});

export type UpdateBroadcastRequest = Static<typeof UpdateBroadcastRequest>;

export const TriggerBroadcastRequest = Type.Object({
  workspaceId: Type.String(),
  id: Type.String(),
});

export type TriggerBroadcastRequest = Static<typeof TriggerBroadcastRequest>;

export const UpsertSegmentResource = Type.Intersect([
  Type.Omit(Type.Partial(SegmentResource), ["id"]),
  Type.Pick(SegmentResource, ["id"]),
]);

export type UpsertSegmentResource = Static<typeof UpsertSegmentResource>;

export const DeleteSegmentRequest = Type.Object({
  id: Type.String(),
});

export type DeleteSegmentRequest = Static<typeof DeleteSegmentRequest>;

export const GetEventsRequest = Type.Object({
  workspaceId: Type.String(),
  searchTerm: Type.Optional(Type.String()),
  userId: Type.Optional(Type.String()),
  offset: Type.Number(),
  limit: Type.Number(),
  startDate: Type.Optional(Type.Number()),
  endDate: Type.Optional(Type.Number()),
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

export const EmailContents = Type.Object({
  from: Type.String(),
  body: Type.String(),
  subject: Type.String(),
  replyTo: Type.Optional(Type.String()),
});

export const EmailTemplateResource = Type.Composite([
  Type.Object({
    type: Type.Literal(ChannelType.Email),
  }),
  EmailContents,
]);

export type EmailTemplateResource = Static<typeof EmailTemplateResource>;

export const EmailConfiguration = Type.Composite([
  EmailContents,
  Type.Object({
    to: Type.String(),
    headers: Type.Optional(Type.Record(Type.String(), Type.String())),
  }),
]);

export type EmailConfiguration = Static<typeof EmailConfiguration>;

export const MobilePushTemplateResource = Type.Object({
  type: Type.Literal(ChannelType.MobilePush),
  title: Type.Optional(Type.String()),
  body: Type.Optional(Type.String()),
  imageUrl: Type.Optional(Type.String()),
  android: Type.Optional(
    Type.Object({
      notification: Type.Object({
        channelId: Type.Optional(Type.String()),
      }),
    }),
  ),
});

export type MobilePushTemplateResource = Static<
  typeof MobilePushTemplateResource
>;

const SmsContents = Type.Object({
  body: Type.String(),
});

export const SmsTemplateResource = Type.Composite([
  Type.Object({
    type: Type.Literal(ChannelType.Sms),
  }),
  SmsContents,
]);

export type SmsTemplateResource = Static<typeof SmsTemplateResource>;

export const MessageTemplateResourceDefinition = Type.Union([
  MobilePushTemplateResource,
  EmailTemplateResource,
  SmsTemplateResource,
]);

export type MessageTemplateResourceDefinition = Static<
  typeof MessageTemplateResourceDefinition
>;

const MessageTemplateResourceProperties = {
  workspaceId: Type.String(),
  id: Type.String(),
  name: Type.String(),
  definition: Type.Optional(MessageTemplateResourceDefinition),
  draft: Type.Optional(MessageTemplateResourceDefinition),
  updatedAt: Type.Number(),
} as const;

export const MessageTemplateResource = Type.Object(
  MessageTemplateResourceProperties,
);

export type MessageTemplateResource = Static<typeof MessageTemplateResource>;

export type NarrowedMessageTemplateResource<
  T extends MessageTemplateResourceDefinition,
> = Omit<MessageTemplateResource, "definition"> & {
  definition: T;
};

export const UpsertMessageTemplateResource = Type.Object({
  workspaceId: Type.Optional(Type.String()),
  id: Type.String(),
  name: Type.Optional(Type.String()),
  definition: Type.Optional(MessageTemplateResourceDefinition),
  draft: Type.Optional(MessageTemplateResourceDefinition),
});

export type UpsertMessageTemplateResource = Static<
  typeof UpsertMessageTemplateResource
>;

export const DeleteMessageTemplateRequest = Type.Object({
  id: Type.String(),
  type: Type.Enum(ChannelType),
});

export type DeleteMessageTemplateRequest = Static<
  typeof DeleteMessageTemplateRequest
>;

export enum CompletionStatus {
  NotStarted = "NotStarted",
  InProgress = "InProgress",
  Successful = "Successful",
  Failed = "Failed",
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
  AmazonSes = "AmazonSes",
  Resend = "Resend",
  PostMark = "PostMark",
  Smtp = "Smtp",
  Test = "Test",
}

export enum MobilePushProviderType {
  Firebase = "Firebase",
  Test = "Test",
}

export const TestEmailProvider = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  type: Type.Literal(EmailProviderType.Test),
});

export type TestEmailProvider = Static<typeof TestEmailProvider>;

export const SendgridEmailProvider = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  type: Type.Literal(EmailProviderType.Sendgrid),
});

export type SendgridEmailProvider = Static<typeof SendgridEmailProvider>;

export const AmazonSesEmailProvider = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  type: Type.Literal(EmailProviderType.AmazonSes),
});

export type AmazonSesEmailProvider = Static<typeof AmazonSesEmailProvider>;

export const SmtpEmailProvider = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  type: Type.Literal(EmailProviderType.Smtp),
});

export type SmtpEmailProvider = Static<typeof SmtpEmailProvider>;

export const ResendEmailProvider = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  type: Type.Literal(EmailProviderType.Resend),
});

export type ResendEmailProvider = Static<typeof ResendEmailProvider>;

export const PostMarkEmailProvider = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  type: Type.Literal(EmailProviderType.PostMark),
});

export type PostMarkEmailProvider = Static<typeof PostMarkEmailProvider>;

export const PersistedEmailProvider = Type.Union([
  SendgridEmailProvider,
  AmazonSesEmailProvider,
  PostMarkEmailProvider,
  ResendEmailProvider,
  SmtpEmailProvider,
  TestEmailProvider,
]);

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
  ["id"],
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
  fromAddress: Nullable(Type.String()),
});

export type DefaultEmailProviderResource = Static<
  typeof DefaultEmailProviderResource
>;

export const JourneyResourceStatusEnum = {
  NotStarted: "NotStarted",
  Running: "Running",
  Paused: "Paused",
  Broadcast: "Broadcast",
} as const;

export enum AdditionalJourneyNodeType {
  EntryUiNode = "EntryUiNode",
}

export const PartialExceptType = <T1 extends TSchema>(schema: T1) =>
  Type.Composite([
    Type.Partial(Type.Omit(schema, ["type"])),
    Type.Pick(schema, ["type"]),
  ]);

export const EntryUiNodeVariant = Type.Union([
  PartialExceptType(SegmentEntryNode),
  PartialExceptType(EventEntryNode),
]);

export type EntryUiNodeVariant = Static<typeof EntryUiNodeVariant>;

export const EntryUiNodeProps = Type.Object({
  type: Type.Literal(AdditionalJourneyNodeType.EntryUiNode),
  variant: EntryUiNodeVariant,
});

export type EntryUiNodeProps = Static<typeof EntryUiNodeProps>;

export const ExitUiNodeProps = Type.Object({
  type: Type.Literal(JourneyNodeType.ExitNode),
});

export type ExitUiNodeProps = Static<typeof ExitUiNodeProps>;

export const MessageUiNodeProps = Type.Object({
  type: Type.Literal(JourneyNodeType.MessageNode),
  name: Type.String(),
  templateId: Type.Optional(Type.String()),
  channel: Type.Enum(ChannelType),
  subscriptionGroupId: Type.Optional(Type.String()),
});

export type MessageUiNodeProps = Static<typeof MessageUiNodeProps>;

export const DelayUiNodeVariant = Type.Union([
  PartialExceptType(LocalTimeDelayVariant),
  PartialExceptType(SecondsDelayVariant),
]);

export type DelayUiNodeVariant = Static<typeof DelayUiNodeVariant>;

export const DelayUiNodeProps = Type.Object({
  type: Type.Literal(JourneyNodeType.DelayNode),
  variant: DelayUiNodeVariant,
});

export type DelayUiNodeProps = Static<typeof DelayUiNodeProps>;

export const SegmentSplitUiNodeProps = Type.Object({
  type: Type.Literal(JourneyNodeType.SegmentSplitNode),
  name: Type.String(),
  segmentId: Type.Optional(Type.String()),
  trueLabelNodeId: Type.String(),
  falseLabelNodeId: Type.String(),
});

export type SegmentSplitUiNodeProps = Static<typeof SegmentSplitUiNodeProps>;

export const WaitForUiNodeProps = Type.Object({
  type: Type.Literal(JourneyNodeType.WaitForNode),
  timeoutSeconds: Type.Optional(Type.Number()),
  timeoutLabelNodeId: Type.String(),
  segmentChildren: Type.Array(
    Type.Object({
      labelNodeId: Type.String(),
      segmentId: Type.Optional(Type.String()),
    }),
  ),
});

export type WaitForUiNodeProps = Static<typeof WaitForUiNodeProps>;

export const JourneyUiBodyNodeTypeProps = Type.Union([
  MessageUiNodeProps,
  DelayUiNodeProps,
  SegmentSplitUiNodeProps,
  WaitForUiNodeProps,
]);

export type JourneyUiBodyNodeTypeProps = Static<
  typeof JourneyUiBodyNodeTypeProps
>;

export const JourneyUiNodeTypeProps = Type.Union([
  EntryUiNodeProps,
  ExitUiNodeProps,
  JourneyUiBodyNodeTypeProps,
]);

export type JourneyUiNodeTypeProps = Static<typeof JourneyUiNodeTypeProps>;

export type JourneyUiNodePairing =
  | [EntryUiNodeProps, EntryNode]
  | [ExitUiNodeProps, ExitNode]
  | [MessageUiNodeProps, SegmentNode]
  | [DelayUiNodeProps, SegmentNode]
  | [SegmentSplitUiNodeProps, SegmentNode]
  | [WaitForUiNodeProps, WaitForNode];

export enum JourneyUiNodeType {
  JourneyUiNodeDefinitionProps = "JourneyUiNodeDefinitionProps",
  JourneyUiNodeEmptyProps = "JourneyUiNodeEmptyProps",
  JourneyUiNodeLabelProps = "JourneyUiNodeLabelProps",
}

export const JourneyUiNodeDefinitionProps = Type.Object({
  type: Type.Literal(JourneyUiNodeType.JourneyUiNodeDefinitionProps),
  nodeTypeProps: JourneyUiNodeTypeProps,
});

export type JourneyUiNodeDefinitionProps = Static<
  typeof JourneyUiNodeDefinitionProps
>;

export const JourneyUiNodeEmptyProps = Type.Object({
  type: Type.Literal(JourneyUiNodeType.JourneyUiNodeEmptyProps),
});

export type JourneyUiNodeEmptyProps = Static<typeof JourneyUiNodeEmptyProps>;

export const JourneyUiNodeLabelProps = Type.Object({
  type: Type.Literal(JourneyUiNodeType.JourneyUiNodeLabelProps),
  title: Type.String(),
});

export type JourneyUiNodeLabelProps = Static<typeof JourneyUiNodeLabelProps>;

export const JourneyUiNodePresentationalProps = Type.Union([
  JourneyUiNodeLabelProps,
  JourneyUiNodeEmptyProps,
]);

export type JourneyUiNodePresentationalProps = Static<
  typeof JourneyUiNodePresentationalProps
>;

export const JourneyNodeUiProps = Type.Union([
  JourneyUiNodeDefinitionProps,
  JourneyUiNodePresentationalProps,
]);

export type JourneyNodeUiProps = Static<typeof JourneyNodeUiProps>;

export type TimeUnit = "seconds" | "minutes" | "hours" | "days" | "weeks";

export enum JourneyUiEdgeType {
  JourneyUiDefinitionEdgeProps = "JourneyUiDefinitionEdgeProps",
  JourneyUiPlaceholderEdgeProps = "JourneyUiPlaceholderEdgeProps",
}

export const JourneyUiDefinitionEdgeProps = Type.Object({
  type: Type.Literal(JourneyUiEdgeType.JourneyUiDefinitionEdgeProps),
  disableMarker: Type.Optional(Type.Boolean()),
});

export type JourneyUiDefinitionEdgeProps = Static<
  typeof JourneyUiDefinitionEdgeProps
>;

export const JourneyUiPlaceholderEdgeProps = Type.Object({
  type: Type.Literal(JourneyUiEdgeType.JourneyUiPlaceholderEdgeProps),
});

export type JourneyUiPlaceholderEdgeProps = Static<
  typeof JourneyUiPlaceholderEdgeProps
>;

export const JourneyUiEdgeProps = Type.Union([
  JourneyUiDefinitionEdgeProps,
  JourneyUiPlaceholderEdgeProps,
]);

export type JourneyUiEdgeProps = Static<typeof JourneyUiEdgeProps>;

export const JourneyUiDraftEdge = Type.Object({
  source: Type.String(),
  target: Type.String(),
  data: JourneyUiEdgeProps,
});

export type JourneyUiDraftEdge = Static<typeof JourneyUiDraftEdge>;

export const JourneyUiDraftNode = Type.Object({
  id: Type.String(),
  data: JourneyNodeUiProps,
});

export type JourneyUiDraftNode = Static<typeof JourneyUiDraftNode>;

export const JourneyDraft = Type.Object({
  nodes: Type.Array(JourneyUiDraftNode),
  edges: Type.Array(JourneyUiDraftEdge),
});

export type JourneyDraft = Static<typeof JourneyDraft>;

export const JourneyResourceStatus = Type.KeyOf(
  Type.Const(JourneyResourceStatusEnum),
);

export type JourneyResourceStatus = Static<typeof JourneyResourceStatus>;

const baseJourneyResource = {
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  canRunMultiple: Type.Optional(Type.Boolean()),
  updatedAt: Type.Number(),
  draft: Type.Optional(JourneyDraft),
} as const;

export const NotStartedJourneyResource = Type.Object({
  ...baseJourneyResource,
  status: Type.Literal(JourneyResourceStatusEnum.NotStarted),
  definition: Type.Optional(JourneyDefinition),
});

export type NotStartedJourneyResource = Static<
  typeof NotStartedJourneyResource
>;

export const HasStartedJourneyResource = Type.Object({
  ...baseJourneyResource,
  status: Type.Union([
    Type.Literal(JourneyResourceStatusEnum.Running),
    Type.Literal(JourneyResourceStatusEnum.Paused),
    Type.Literal(JourneyResourceStatusEnum.Broadcast),
  ]),
  definition: JourneyDefinition,
});

export type HasStartedJourneyResource = Static<
  typeof HasStartedJourneyResource
>;

export const JourneyResource = Type.Union([
  NotStartedJourneyResource,
  HasStartedJourneyResource,
]);

export type JourneyResource = Static<typeof JourneyResource>;

const Timestamps = Type.Object({
  createdAt: Type.Number(),
  updatedAt: Type.Number(),
});

export const SavedHasStartedJourneyResource = Type.Composite([
  HasStartedJourneyResource,
  Timestamps,
]);

export type SavedHasStartedJourneyResource = Static<
  typeof SavedHasStartedJourneyResource
>;

export const SavedNotStartedJourneyResource = Type.Composite([
  NotStartedJourneyResource,
  Timestamps,
]);

export type SavedNotStartedJourneyResource = Static<
  typeof SavedNotStartedJourneyResource
>;

export const SavedJourneyResource = Type.Union([
  SavedNotStartedJourneyResource,
  SavedHasStartedJourneyResource,
]);

export type SavedJourneyResource = Static<typeof SavedJourneyResource>;

export const UpsertJourneyResource = Type.Composite([
  Type.Partial(
    Type.Omit(
      Type.Object({
        ...baseJourneyResource,
        definition: JourneyDefinition,
        status: Type.Enum(JourneyResourceStatusEnum),
      }),
      ["draft"],
    ),
  ),
  Type.Object({
    id: Type.String(),
    workspaceId: Type.String(),
    draft: Type.Optional(Nullable(JourneyDraft)),
  }),
]);

export type UpsertJourneyResource = Static<typeof UpsertJourneyResource>;

export const EmptyResponse = Type.String({
  description: "An empty String",
});

export type EmptyResponse = Static<typeof EmptyResponse>;

export const DeleteJourneyRequest = Type.Object({
  id: Type.String(),
});

export type DeleteJourneyRequest = Static<typeof DeleteJourneyRequest>;

export const UserPropertyResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  definition: UserPropertyDefinition,
  exampleValue: Type.Optional(Type.String()),
  updatedAt: Type.Number(),
  lastRecomputed: Type.Optional(Type.Number()),
});

export type UserPropertyResource = Static<typeof UserPropertyResource>;

export const SavedUserPropertyResource = Type.Composite([
  UserPropertyResource,
  Type.Object({
    createdAt: Type.Number(),
    updatedAt: Type.Number(),
    definitionUpdatedAt: Type.Number(),
  }),
]);

export type SavedUserPropertyResource = Static<
  typeof SavedUserPropertyResource
>;

export const UpsertUserPropertyResource = Type.Intersect([
  Type.Omit(Type.Partial(UserPropertyResource), ["id", "name"]),
  Type.Pick(UserPropertyResource, ["id", "name"]),
]);

export type UpsertUserPropertyResource = Static<
  typeof UpsertUserPropertyResource
>;

export const DeleteUserPropertyRequest = Type.Object({
  workspaceId: Type.String(),
  id: Type.String(),
});

export type DeleteUserPropertyRequest = Static<
  typeof DeleteUserPropertyRequest
>;

export const ReadAllUserPropertiesRequest = Type.Object({
  workspaceId: Type.String(),
});

export type ReadAllUserPropertiesRequest = Static<
  typeof ReadAllUserPropertiesRequest
>;

export const ReadAllUserPropertiesResponse = Type.Object({
  userProperties: Type.Array(UserPropertyResource),
});

export type ReadAllUserPropertiesResponse = Static<
  typeof ReadAllUserPropertiesResponse
>;

export enum CursorDirectionEnum {
  After = "after",
  Before = "before",
}

export const CursorDirection = Type.Enum(CursorDirectionEnum);

export const GetUsersUserPropertyFilter = Type.Array(
  Type.Object({
    id: Type.String(),
    values: Type.Array(Type.String()),
  }),
);

export type GetUsersUserPropertyFilter = Static<
  typeof GetUsersUserPropertyFilter
>;

export const GetUsersRequest = Type.Object({
  cursor: Type.Optional(Type.String()),
  segmentFilter: Type.Optional(Type.Array(Type.String())),
  limit: Type.Optional(Type.Number()),
  direction: Type.Optional(CursorDirection),
  userIds: Type.Optional(Type.Array(Type.String())),
  userPropertyFilter: Type.Optional(GetUsersUserPropertyFilter),
  workspaceId: Type.String(),
});

export type GetUsersRequest = Static<typeof GetUsersRequest>;

const GetUsersResponseItem = Type.Object({
  id: Type.String(),
  // map from id to name and value
  properties: Type.Record(
    Type.String(),
    Type.Object({
      name: Type.String(),
      value: Type.Any(),
    }),
  ),
  segments: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
    }),
  ),
});

export type GetUsersResponseItem = Static<typeof GetUsersResponseItem>;

export const GetUsersResponse = Type.Object({
  users: Type.Array(GetUsersResponseItem),
  previousCursor: Type.Optional(Type.String()),
  nextCursor: Type.Optional(Type.String()),
  userCount: Type.Number(),
});

export type GetUsersResponse = Static<typeof GetUsersResponse>;

export const BaseMessageResponse = Type.Object({
  message: Type.String(),
});

export const BadRequestResponse = BaseMessageResponse;

export enum SourceControlProviderEnum {
  GitHub = "github",
}

export const SourceControlProvider = Type.Enum(SourceControlProviderEnum);

export const WorkspaceId = Type.String({
  description:
    "Id of the workspace which will receive the segment payload. Defaults to the default workspace id, for single tenant systems",
});

export type WorkspaceId = Static<typeof WorkspaceId>;

export const UserUploadEmailRow = Type.Intersect([
  Type.Record(Type.String(), Type.String()),
  Type.Object({
    email: Type.String({ minLength: 1 }),
  }),
]);

export type UserUploadEmailRow = Static<typeof UserUploadEmailRow>;

export const UserUploadRow = Type.Union([
  Type.Intersect([
    Type.Record(Type.String(), Type.String()),
    Type.Object({
      id: Type.String({ minLength: 1 }),
    }),
  ]),
  UserUploadEmailRow,
]);

export type UserUploadRow = Static<typeof UserUploadRow>;

export const RoleEnum = {
  Admin: "Admin",
  WorkspaceManager: "WorkspaceManager",
  Author: "Author",
  Viewer: "Viewer",
} as const;

export type Role = (typeof RoleEnum)[keyof typeof RoleEnum];
export const Role = Type.Enum(RoleEnum);

export const WorkspaceMemberResource = Type.Object({
  id: Type.String(),
  email: Type.String(),
  emailVerified: Type.Boolean(),
  picture: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  nickname: Type.Optional(Type.String()),
  createdAt: Type.String(),
});

export type WorkspaceMemberResource = Static<typeof WorkspaceMemberResource>;

export const WorkspaceMemberRoleResource = Type.Object({
  role: Role,
  workspaceMemberId: Type.String(),
  workspaceId: Type.String(),
  workspaceName: Type.String(),
});

export type WorkspaceMemberRoleResource = Static<
  typeof WorkspaceMemberRoleResource
>;

export interface DFRequestContext {
  workspace: WorkspaceResource;
  member: WorkspaceMemberResource;
  memberRoles: WorkspaceMemberRoleResource[];
}

export const UserSubscriptionResource = Type.Object({
  id: Type.String(),
  name: Type.String(),
  isSubscribed: Type.Boolean(),
});

export type UserSubscriptionResource = Static<typeof UserSubscriptionResource>;

export const SubscriptionParams = Type.Object(
  {
    w: Type.String({ description: "Workspace Id." }),
    i: Type.String({
      description: 'Identifier value for channel e.g. "name@email.com".',
    }),
    ik: Type.String({
      description: 'Identifier key for channel e.g. "email".',
    }),
    h: Type.String({
      description:
        "Subscription change hash, used to authenticate subscription changes.",
    }),
    s: Type.Optional(
      Type.String({
        description: "Subscription group Id.",
      }),
    ),
    sub: Type.Optional(
      Type.Union([
        Type.Literal("1", {
          description: "Subscribing user to subscription group.",
        }),
        Type.Literal("0", {
          description: "Unsubscribing user from subscription group.",
        }),
      ]),
    ),
  },
  {
    description:
      "Subscription management parameters with shorted parameter names for efficient query param serialization.",
  },
);

export type SubscriptionParams = Static<typeof SubscriptionParams>;

export const UserSubscriptionLookup = Type.Object({
  workspaceId: Type.String({ description: "Workspace Id." }),
  hash: Type.String({
    description:
      "Subscription change hash, used to authenticate subscription changes.",
  }),
  identifier: Type.String({
    description: "Identifier value for channel.",
    examples: ["user@email.com"],
  }),
  identifierKey: Type.String({
    description: "Identifier key for channel.",
    examples: ["email"],
  }),
});

export type UserSubscriptionLookup = Static<typeof UserSubscriptionLookup>;

export const UserSubscriptionsUpdate = Type.Intersect([
  UserSubscriptionLookup,
  Type.Object({
    changes: Type.Record(Type.String(), Type.Boolean(), {
      description: "Subscription changes.",
    }),
  }),
]);

export type UserSubscriptionsUpdate = Static<typeof UserSubscriptionsUpdate>;

const RenderMessageTemplateRequestContent = Type.Object({
  value: Type.String(),
  mjml: Type.Optional(Type.Boolean()),
});

export type RenderMessageTemplateRequestContent = Static<
  typeof RenderMessageTemplateRequestContent
>;

export const RenderMessageTemplateRequestContents = Type.Record(
  Type.String(),
  RenderMessageTemplateRequestContent,
);

export type RenderMessageTemplateRequestContents = Static<
  typeof RenderMessageTemplateRequestContents
>;

export const RenderMessageTemplateRequest = Type.Object({
  workspaceId: Type.String(),
  channel: Type.Enum(ChannelType),
  subscriptionGroupId: Type.Optional(Type.String()),
  contents: RenderMessageTemplateRequestContents,
  userProperties: Type.Record(Type.String(), Type.Any()),
});

export type RenderMessageTemplateRequest = Static<
  typeof RenderMessageTemplateRequest
>;

export const RenderMessageTemplateResponseContent = JsonResult(
  Type.String(),
  Type.String(),
);

export type RenderMessageTemplateResponseContent = Static<
  typeof RenderMessageTemplateResponseContent
>;

export const RenderMessageTemplateResponse = Type.Object({
  contents: Type.Record(Type.String(), RenderMessageTemplateResponseContent),
});

export type RenderMessageTemplateResponse = Static<
  typeof RenderMessageTemplateResponse
>;

export const DeleteSubscriptionGroupRequest = Type.Object({
  id: Type.String(),
});

export type DeleteSubscriptionGroupRequest = Static<
  typeof DeleteSubscriptionGroupRequest
>;

export const AppDataContext = Type.Optional(
  Type.Record(Type.String(), Type.Any()),
);

export type AppDataContext = Static<typeof AppDataContext>;

export const BaseAppData = {
  messageId: Type.String(),
  timestamp: Type.Optional(Type.String()),
};

export const BaseIdentifyData = {
  ...BaseAppData,
  context: AppDataContext,
  traits: Type.Optional(Type.Record(Type.String(), Type.Any())),
};

export const BaseBatchIdentifyData = {
  ...BaseAppData,
  type: Type.Literal(EventType.Identify),
  traits: Type.Optional(Type.Record(Type.String(), Type.Any())),
};

const KnownIdentifyData = Type.Object({
  ...BaseIdentifyData,
  userId: Type.String(),
});

export type KnownIdentifyData = Static<typeof KnownIdentifyData>;

const AnonymousIdentifyData = Type.Object({
  ...BaseIdentifyData,
  anonymousId: Type.String(),
});

export type AnonymousIdentifyData = Static<typeof AnonymousIdentifyData>;

export const IdentifyData = Type.Union([
  KnownIdentifyData,
  AnonymousIdentifyData,
]);

export type IdentifyData = Static<typeof IdentifyData>;

export const KnownBatchIdentifyData = Type.Object({
  ...BaseBatchIdentifyData,
  userId: Type.String(),
});

export type KnownBatchIdentifyData = Static<typeof KnownBatchIdentifyData>;

export const AnonymousBatchIdentifyData = Type.Object({
  ...BaseBatchIdentifyData,
  anonymousId: Type.String(),
});

export type AnonymousBatchIdentifyData = Static<
  typeof AnonymousBatchIdentifyData
>;

export const BatchIdentifyData = Type.Union([
  KnownBatchIdentifyData,
  AnonymousBatchIdentifyData,
]);

export type BatchIdentifyData = Static<typeof BatchIdentifyData>;

export const BaseTrackData = {
  ...BaseAppData,
  context: AppDataContext,
  event: Type.String(),
  properties: Type.Optional(Type.Record(Type.String(), Type.Any())),
};

export const BaseBatchTrackData = {
  ...BaseAppData,
  type: Type.Literal(EventType.Track),
  event: Type.String(),
  properties: Type.Optional(Type.Record(Type.String(), Type.Any())),
};

export const KnownTrackData = Type.Object({
  ...BaseTrackData,
  userId: Type.String(),
});

export type KnownTrackData = Static<typeof KnownTrackData>;

export const AnonymousTrackData = Type.Object({
  ...BaseTrackData,
  anonymousId: Type.String(),
});

export type AnonymousTrackData = Static<typeof AnonymousTrackData>;

export const TrackData = Type.Union([KnownTrackData, AnonymousTrackData]);

export type TrackData = Static<typeof TrackData>;

export const KnownBatchTrackData = Type.Object({
  ...BaseBatchTrackData,
  userId: Type.String(),
});

export type KnownBatchTrackData = Static<typeof KnownBatchTrackData>;

export const AnonymousBatchTrackData = Type.Object({
  ...BaseBatchTrackData,
  anonymousId: Type.String(),
});

export type AnonymousBatchTrackData = Static<typeof AnonymousBatchTrackData>;

export const BatchTrackData = Type.Union([
  KnownBatchTrackData,
  AnonymousBatchTrackData,
]);

export type BatchTrackData = Static<typeof BatchTrackData>;

export const BasePageData = {
  ...BaseAppData,
  context: AppDataContext,
  name: Type.Optional(Type.String()),
  properties: Type.Optional(Type.Record(Type.String(), Type.Any())),
};

export const BaseBatchPageData = {
  ...BaseAppData,
  type: Type.Literal(EventType.Page),
  name: Type.Optional(Type.String()),
  properties: Type.Optional(Type.Record(Type.String(), Type.Any())),
};

export const KnownPageData = Type.Object({
  ...BasePageData,
  userId: Type.String(),
});

export type KnownPageData = Static<typeof KnownPageData>;

export const AnonymousPageData = Type.Object({
  ...BasePageData,
  anonymousId: Type.String(),
});

export type AnonymousPageData = Static<typeof AnonymousPageData>;

export const PageData = Type.Union([KnownPageData, AnonymousPageData]);

export type PageData = Static<typeof PageData>;

export const BatchPageData = Type.Union([
  Type.Object({
    ...BaseBatchPageData,
    userId: Type.String(),
  }),
  Type.Object({
    ...BaseBatchPageData,
    anonymousId: Type.String(),
  }),
]);

export type BatchPageData = Static<typeof BatchPageData>;

export const BaseScreenData = {
  ...BaseAppData,
  context: AppDataContext,
  name: Type.Optional(Type.String()),
  properties: Type.Optional(Type.Record(Type.String(), Type.Any())),
};

export const BaseBatchScreenData = {
  ...BaseAppData,
  type: Type.Literal(EventType.Screen),
  name: Type.Optional(Type.String()),
  properties: Type.Optional(Type.Record(Type.String(), Type.Any())),
};

export const KnownScreenData = Type.Object({
  ...BaseScreenData,
  userId: Type.String(),
});

export type KnownScreenData = Static<typeof KnownScreenData>;

export const AnonymousScreenData = Type.Object({
  ...BaseScreenData,
  anonymousId: Type.String(),
});

export type AnonymousScreenData = Static<typeof AnonymousScreenData>;

export const ScreenData = Type.Union([KnownScreenData, AnonymousScreenData]);

export type ScreenData = Static<typeof ScreenData>;

export const BatchScreenData = Type.Union([
  Type.Object({
    ...BaseBatchScreenData,
    userId: Type.String(),
  }),
  Type.Object({
    ...BaseBatchScreenData,
    anonymousId: Type.String(),
  }),
]);

export type BatchScreenData = Static<typeof BatchScreenData>;

const BatchItem = Type.Union([
  BatchIdentifyData,
  BatchTrackData,
  BatchPageData,
  BatchScreenData,
]);

export type BatchItem = Static<typeof BatchItem>;

export const BatchAppData = Type.Object(
  {
    batch: Type.Array(BatchItem),
    context: AppDataContext,
  },
  {
    examples: [
      {
        batch: [
          {
            type: "track",
            event: "Signed Up",
            userId: "1043",
            properties: {
              plan: "Enterprise",
            },
            messageId: "1ff51c9c-4929-45de-8914-3bb878be8c4a",
          },
          {
            type: "identify",
            userId: "532",
            traits: {
              email: "john@email.com",
            },
            messageId: "6f5f436d-8534-4070-8023-d18f8b78ed39",
          },
        ],
      },
    ],
  },
);

export type BatchAppData = Static<typeof BatchAppData>;

export const WriteKeyResource = Type.Object({
  writeKeyName: Type.String(),
  writeKeyValue: Type.String(),
  secretId: Type.String(),
  workspaceId: Type.String(),
});

export type WriteKeyResource = Static<typeof WriteKeyResource>;

export const UpsertWriteKeyResource = Type.Object({
  writeKeyName: Type.String(),
  writeKeyValue: Type.String(),
  workspaceId: Type.String(),
});
export type UpsertWriteKeyResource = Static<typeof UpsertWriteKeyResource>;

export const ListWriteKeyRequest = Type.Object({
  workspaceId: Type.String(),
});

export type ListWriteKeyRequest = Static<typeof ListWriteKeyRequest>;

export const ListWriteKeyResource = Type.Array(WriteKeyResource);

export type ListWriteKeyResource = Static<typeof ListWriteKeyResource>;

export const DeleteWriteKeyResource = Type.Object({
  writeKeyName: Type.String(),
  workspaceId: Type.String(),
});

export type DeleteWriteKeyResource = Static<typeof DeleteWriteKeyResource>;

export const UpsertSecretRequest = Type.Object({
  name: Type.String(),
  value: Type.Optional(Type.String()),
  configValue: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  workspaceId: Type.String(),
});

export type UpsertSecretRequest = Static<typeof UpsertSecretRequest>;

export const DeleteSecretRequest = Type.Object({
  name: Type.String(),
  workspaceId: Type.String(),
});

export type DeleteSecretRequest = Static<typeof DeleteSecretRequest>;

export const ListSecretsRequest = Type.Object({
  workspaceId: Type.String(),
  names: Type.Optional(Type.Array(Type.String())),
});

export type ListSecretsRequest = Static<typeof ListSecretsRequest>;

export const SecretResource = Type.Object({
  name: Type.String(),
  value: Type.String(),
  workspaceId: Type.String(),
});

export type SecretResource = Static<typeof SecretResource>;

export const ValueError = Type.Object({
  path: Type.String(),
  value: Type.Unknown(),
  message: Type.String(),
});

export const UserUploadRowErrors = Type.Object({
  row: Type.Number(),
  error: Type.String(),
});

export type UserUploadRowErrors = Static<typeof UserUploadRowErrors>;

export const CsvUploadValidationError = Type.Object({
  message: Type.String(),
  rowErrors: Type.Optional(Type.Array(UserUploadRowErrors)),
});

export type CsvUploadValidationError = Static<typeof CsvUploadValidationError>;

export enum IntegrationType {
  Sync = "Sync",
}

export const SyncIntegration = Type.Object({
  type: Type.Literal(IntegrationType.Sync),
  subscribedSegments: Type.Array(Type.String()),
  subscribedUserProperties: Type.Array(Type.String()),
});

export type SyncIntegration = Static<typeof SyncIntegration>;

export const IntegrationDefinition = Type.Union([SyncIntegration]);

export type IntegrationDefinition = Static<typeof IntegrationDefinition>;

export const IntegrationResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  definition: IntegrationDefinition,
  enabled: Type.Boolean(),
});

export type IntegrationResource = Static<typeof IntegrationResource>;

export const UpsertIntegrationResource = Type.Composite([
  Type.Partial(Type.Pick(IntegrationResource, ["enabled", "definition"])),
  Type.Pick(IntegrationResource, ["workspaceId", "name"]),
]);

export type UpsertIntegrationResource = Static<
  typeof UpsertIntegrationResource
>;

export const OauthTokenResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  accessToken: Type.String(),
  refreshToken: Type.String(),
  expiresIn: Type.Number(),
  createdAt: Type.Number(),
  updatedAt: Type.Optional(Type.Number()),
});

export type OauthTokenResource = Static<typeof OauthTokenResource>;

export const BoolStr = Type.Union([
  Type.Literal("true"),
  Type.Literal("false"),
]);

export enum NodeStatsType {
  MessageNodeStats = "MessageNodeStats",
  SegmentSplitNodeStats = "SegmentSplitNodeStats",
  WaitForNodeStats = "WaitForNodeStats",
  DelayNodeStats = "DelayNodeStats",
}

export const EmailStats = Type.Object({
  type: Type.Literal(ChannelType.Email),
  deliveryRate: Type.Number(),
  openRate: Type.Number(),
  clickRate: Type.Number(),
  spamRate: Type.Number(),
});

export type EmailStats = Static<typeof EmailStats>;

export const SmsStats = Type.Object({
  type: Type.Literal(ChannelType.Sms),
  deliveryRate: Type.Number(),
  failRate: Type.Optional(Type.Number()),
});

export type SmsStats = Static<typeof SmsStats>;

export const MessageChannelStats = Type.Union([EmailStats, SmsStats]);

export type MessageChannelStats = Static<typeof MessageChannelStats>;

export const BaseMessageNodeStats = Type.Object({
  sendRate: Type.Optional(Type.Number()),
  channelStats: Type.Optional(MessageChannelStats),
});

export type BaseMessageNodeStats = Static<typeof BaseMessageNodeStats>;

export const MessageNodeStats = Type.Composite([
  BaseMessageNodeStats,
  Type.Object({
    type: Type.Literal(NodeStatsType.MessageNodeStats),
    proportions: Type.Object({
      childEdge: Type.Number(),
    }),
  }),
]);

export type MessageNodeStats = Static<typeof MessageNodeStats>;

export const DelayNodeStats = Type.Object({
  type: Type.Literal(NodeStatsType.DelayNodeStats),
  proportions: Type.Object({
    childEdge: Type.Number(),
  }),
});

export type DelayNodeStats = Static<typeof DelayNodeStats>;

export const WaitForNodeStats = Type.Object({
  type: Type.Literal(NodeStatsType.WaitForNodeStats),
  proportions: Type.Object({
    segmentChildEdge: Type.Number(),
  }),
});

export type WaitForNodeStats = Static<typeof WaitForNodeStats>;

export const SegmentSplitNodeStats = Type.Object({
  type: Type.Literal(NodeStatsType.SegmentSplitNodeStats),
  proportions: Type.Object({
    falseChildEdge: Type.Number(),
  }),
});

export type SegmentSplitNodeStats = Static<typeof SegmentSplitNodeStats>;

export const NodeStats = Type.Union([
  MessageNodeStats,
  DelayNodeStats,
  WaitForNodeStats,
  SegmentSplitNodeStats,
]);

export type NodeStats = Static<typeof NodeStats>;

export const JourneyStats = Type.Object({
  journeyId: Type.String(),
  workspaceId: Type.String(),
  nodeStats: Type.Record(Type.String(), NodeStats),
});

export type JourneyStats = Static<typeof JourneyStats>;

export const JourneyStatsResponse = Type.Array(JourneyStats);

export type JourneyStatsResponse = Static<typeof JourneyStatsResponse>;

export const JourneyStatsRequest = Type.Object({
  workspaceId: Type.String(),
  journeyIds: Type.Optional(Type.Array(Type.String())),
});

export type JourneyStatsRequest = Static<typeof JourneyStatsRequest>;

export enum SmsProviderType {
  Twilio = "Twilio",
  Test = "Test",
}

export const TwilioSecret = Type.Object({
  type: Type.Literal(SmsProviderType.Twilio),
  accountSid: Type.Optional(Type.String()),
  messagingServiceSid: Type.Optional(Type.String()),
  authToken: Type.Optional(Type.String()),
});

export const TwilioSmsProvider = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  type: Type.Optional(Type.Literal(SmsProviderType.Twilio)),
});

export type TwilioSecret = Static<typeof TwilioSecret>;

export const TestSmsSecret = Type.Object({
  type: Type.Literal(SmsProviderType.Test),
});

export type TestSmsSecret = Static<typeof TestSmsSecret>;

export const TestSmsProvider = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  type: Type.Literal(SmsProviderType.Test),
});

export const SmsProviderSecret = Type.Union([TwilioSecret, TestSmsSecret]);

export type SmsProviderSecret = Static<typeof SmsProviderSecret>;

export type TwilioSmsProvider = Static<typeof TwilioSmsProvider>;

export const PersistedSmsProvider = Type.Union([
  TwilioSmsProvider,
  TestSmsProvider,
]);

export type PersistedSmsProvider = Static<typeof PersistedSmsProvider>;

export const UpsertSmsProviderRequest = Type.Object({
  workspaceId: Type.String(),
  setDefault: Type.Optional(Type.Boolean()),
  type: Type.Optional(Type.Enum(SmsProviderType)),
  secret: Type.Omit(SmsProviderSecret, ["type"]),
});

export type UpsertSmsProviderRequest = Static<typeof UpsertSmsProviderRequest>;

export const DefaultSmsProviderResource = Type.Object({
  workspaceId: Type.String(),
  smsProviderId: Type.String(),
});

export type DefaultSmsProviderResource = Static<
  typeof DefaultSmsProviderResource
>;

export const MessageTemplateTestErrorResponse = Type.Object({});

export type MessageTemplateTestResponse = Static<
  typeof MessageTemplateTestResponse
>;

export const SmsTwilioSuccess = Type.Object({
  type: Type.Literal(SmsProviderType.Twilio),
  sid: Type.String(),
});

export type SmsTwilioSuccess = Static<typeof SmsTwilioSuccess>;

export const SmsTestSuccess = Type.Object({
  type: Type.Literal(SmsProviderType.Test),
});

export type SmsTestSuccess = Static<typeof SmsTestSuccess>;

export const SmsServiceProviderSuccess = Type.Union([
  SmsTwilioSuccess,
  SmsTestSuccess,
]);

export type SmsServiceProviderSuccess = Static<
  typeof SmsServiceProviderSuccess
>;

export const MessageSmsSuccess = Type.Composite([
  Type.Object({
    type: Type.Literal(ChannelType.Sms),
    provider: SmsServiceProviderSuccess,
    to: Type.String(),
  }),
  SmsContents,
]);

export type MessageSmsSuccess = Static<typeof MessageSmsSuccess>;

export const EmailTestSuccess = Type.Object({
  type: Type.Literal(EmailProviderType.Test),
});

export type EmailTestSuccess = Static<typeof EmailTestSuccess>;

export const EmailSendgridSuccess = Type.Object({
  type: Type.Literal(EmailProviderType.Sendgrid),
});

export type EmailSendgridSuccess = Static<typeof EmailSendgridSuccess>;

export const EmailAmazonSesSuccess = Type.Object({
  type: Type.Literal(EmailProviderType.AmazonSes),
  messageId: Type.Optional(Type.String()),
});

export type EmailAmazonSesSuccess = Static<typeof EmailAmazonSesSuccess>;

export const EmailSmtpSuccess = Type.Object({
  type: Type.Literal(EmailProviderType.Smtp),
  messageId: Type.String(),
});

export type EmailSmtpSuccess = Static<typeof EmailSmtpSuccess>;

export const EmailResendSuccess = Type.Object({
  type: Type.Literal(EmailProviderType.Resend),
});

export type EmailResendSuccess = Static<typeof EmailResendSuccess>;

export const EmailPostMarkSuccess = Type.Object({
  type: Type.Literal(EmailProviderType.PostMark),
});

export type EmailPostMarkSuccess = Static<typeof EmailPostMarkSuccess>;

export const EmailServiceProviderSuccess = Type.Union([
  EmailSendgridSuccess,
  EmailAmazonSesSuccess,
  EmailPostMarkSuccess,
  EmailResendSuccess,
  EmailSmtpSuccess,
  EmailTestSuccess,
]);

export type EmailServiceProviderSuccess = Static<
  typeof EmailServiceProviderSuccess
>;

export const MessageEmailSuccess = Type.Composite([
  Type.Object({
    type: Type.Literal(ChannelType.Email),
    provider: EmailServiceProviderSuccess,
    to: Type.String(),
    headers: Type.Optional(Type.Record(Type.String(), Type.String())),
  }),
  EmailContents,
]);

export type MessageEmailSuccess = Static<typeof MessageEmailSuccess>;

export const MessageSkipped = Type.Object({
  type: Type.Literal(InternalEventType.MessageSkipped),
  message: Type.Optional(Type.String()),
});

export type MessageSkipped = Static<typeof MessageSkipped>;

export const MessageSendSuccessVariant = Type.Union([
  MessageEmailSuccess,
  MessageSmsSuccess,
]);

export type MessageSendSuccessVariant = Static<
  typeof MessageSendSuccessVariant
>;

export const MessageSendSuccess = Type.Object({
  type: Type.Literal(InternalEventType.MessageSent),
  variant: MessageSendSuccessVariant,
});

export type MessageSendSuccess = Static<typeof MessageSendSuccess>;

export const MessageSuccess = Type.Union([MessageSendSuccess, MessageSkipped]);

export type MessageSuccess = Static<typeof MessageSuccess>;

export enum BadWorkspaceConfigurationType {
  MessageTemplateNotFound = "MessageTemplateNotFound",
  MessageTemplateMisconfigured = "MessageTemplateMisconfigured",
  MessageTemplateRenderError = "MessageTemplateRenderError",
  JourneyNotFound = "JourneyNotFound",
  SubscriptionGroupNotFound = "SubscriptionGroupNotFound",
  IdentifierNotFound = "IdentifierNotFound",
  SubscriptionSecretNotFound = "SubscriptionSecretNotFound",
  MessageServiceProviderNotFound = "MessageServiceProviderNotFound",
  MessageServiceProviderMisconfigured = "MessageServiceProviderMisconfigured",
}

export const MessageTemplateRenderError = Type.Object({
  type: Type.Literal(BadWorkspaceConfigurationType.MessageTemplateRenderError),
  field: Type.String(),
  error: Type.String(),
});

export type MessageTemplateRenderError = Static<
  typeof MessageTemplateRenderError
>;

export const BadWorkspaceConfigurationVariant = Type.Union([
  Type.Object({
    type: Type.Literal(BadWorkspaceConfigurationType.MessageTemplateNotFound),
  }),
  Type.Object({
    type: Type.Literal(
      BadWorkspaceConfigurationType.MessageTemplateMisconfigured,
    ),
    message: Type.String(),
  }),
  MessageTemplateRenderError,
  Type.Object({
    type: Type.Literal(BadWorkspaceConfigurationType.JourneyNotFound),
  }),
  Type.Object({
    type: Type.Literal(BadWorkspaceConfigurationType.SubscriptionGroupNotFound),
  }),
  Type.Object({
    type: Type.Literal(BadWorkspaceConfigurationType.IdentifierNotFound),
  }),
  Type.Object({
    type: Type.Literal(
      BadWorkspaceConfigurationType.SubscriptionSecretNotFound,
    ),
  }),
  Type.Object({
    type: Type.Literal(
      BadWorkspaceConfigurationType.MessageServiceProviderNotFound,
    ),
  }),
  Type.Object({
    type: Type.Literal(
      BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured,
    ),
    message: Type.Optional(Type.String()),
  }),
]);

export type BadWorkspaceConfigurationVariant = Static<
  typeof BadWorkspaceConfigurationVariant
>;

export const MessageSendBadConfiguration = Type.Object({
  type: Type.Literal(InternalEventType.BadWorkspaceConfiguration),
  variant: BadWorkspaceConfigurationVariant,
});

export type MessageSendBadConfiguration = Static<
  typeof MessageSendBadConfiguration
>;

export const MessageSendgridServiceFailure = Type.Object({
  type: Type.Literal(EmailProviderType.Sendgrid),
  status: Type.Optional(Type.Number()),
  body: Type.Optional(Type.String()),
});

export type MessageSendgridServiceFailure = Static<
  typeof MessageSendgridServiceFailure
>;

export const MessageAmazonSesServiceFailure = Type.Object({
  type: Type.Literal(EmailProviderType.AmazonSes),
  message: Type.Optional(Type.String()),
});

export type MessageAmazonSesServiceFailure = Static<
  typeof MessageAmazonSesServiceFailure
>;

export const MessageSmtpFailure = Type.Object({
  type: Type.Literal(EmailProviderType.Smtp),
  message: Type.String(),
});

export type MessageSmtpFailure = Static<typeof MessageSmtpFailure>;

export const MessageResendFailure = Type.Object({
  type: Type.Literal(EmailProviderType.Resend),
  message: Type.String(),
  name: Type.String(),
});

export type MessageResendFailure = Static<typeof MessageResendFailure>;

export const MessagePostMarkFailure = Type.Object({
  type: Type.Literal(EmailProviderType.PostMark),
  message: Type.String(),
  name: Type.String(),
});

export type MessagePostMarkFailure = Static<typeof MessagePostMarkFailure>;

export const EmailServiceProviderFailure = Type.Union([
  MessageSendgridServiceFailure,
  MessageAmazonSesServiceFailure,
  MessageResendFailure,
  MessagePostMarkFailure,
  MessageSmtpFailure,
]);

export type EmailServiceProviderFailure = Static<
  typeof EmailServiceProviderFailure
>;

export const MessageEmailServiceFailure = Type.Object({
  type: Type.Literal(ChannelType.Email),
  provider: EmailServiceProviderFailure,
});

export type MessageEmailServiceFailure = Static<
  typeof MessageEmailServiceFailure
>;

export const MessageTwilioServiceFailure = Type.Object({
  type: Type.Literal(SmsProviderType.Twilio),
  message: Type.Optional(Type.String()),
});

export const SmsServiceProviderFailure = Type.Union([
  MessageTwilioServiceFailure,
]);

export type SmsServiceProviderFailure = Static<
  typeof SmsServiceProviderFailure
>;

export const MessageSmsServiceFailure = Type.Object({
  type: Type.Literal(ChannelType.Sms),
  provider: SmsServiceProviderFailure,
});

export type MessageSmsServiceFailure = Static<typeof MessageSmsServiceFailure>;

export const MessageServiceFailureVariant = Type.Union([
  MessageEmailServiceFailure,
  MessageSmsServiceFailure,
]);

export type MessageServiceFailureVariant = Static<
  typeof MessageServiceFailureVariant
>;

export const MessageServiceFailure = Type.Object({
  type: Type.Literal(InternalEventType.MessageFailure),
  variant: MessageServiceFailureVariant,
});

export type MessageServiceFailure = Static<typeof MessageServiceFailure>;

export enum SubscriptionChange {
  Subscribe = "Subscribe",
  Unsubscribe = "Unsubscribe",
}

export const UserSubscriptionAction = Nullable(Type.Enum(SubscriptionChange));

export type UserSubscriptionAction = Static<typeof UserSubscriptionAction>;

export enum MessageSkippedType {
  SubscriptionState = "SubscriptionState",
  MissingIdentifier = "MissingIdentifier",
}

export const MessageSkippedSubscriptionState = Type.Object({
  type: Type.Literal(MessageSkippedType.SubscriptionState),
  action: UserSubscriptionAction,
  subscriptionGroupType: Type.Enum(SubscriptionGroupType),
});

export type MessageSkippedSubscriptionState = Static<
  typeof MessageSkippedSubscriptionState
>;

export const MessageSkippedMissingIdentifier = Type.Object({
  type: Type.Literal(MessageSkippedType.MissingIdentifier),
  identifierKey: Type.String(),
});

export const MessageSkippedVariant = Type.Union([
  MessageSkippedSubscriptionState,
  MessageSkippedMissingIdentifier,
]);

export type MessageSkippedVariant = Static<typeof MessageSkippedVariant>;

export const MessageSkippedFailure = Type.Object({
  type: Type.Literal(InternalEventType.MessageSkipped),
  variant: MessageSkippedVariant,
});

export type MessageSkippedFailure = Static<typeof MessageSkippedFailure>;

export const MessageSendFailure = Type.Union([
  MessageSendBadConfiguration,
  MessageServiceFailure,
  MessageSkippedFailure,
]);

export type MessageSendFailure = Static<typeof MessageSendFailure>;

export const MessageSendResult = JsonResult(MessageSuccess, MessageSendFailure);

export type MessageSendResult = Static<typeof MessageSendResult>;

export type BackendMessageSendResult = Result<
  MessageSuccess,
  MessageSendFailure
>;

const BaseMessageTemplateTestRequest = {
  workspaceId: Type.String(),
  templateId: Type.String(),
  userProperties: Type.Record(Type.String(), Type.Any()),
} as const;

export const MessageTemplateTestRequest = Type.Union([
  Type.Object({
    ...BaseMessageTemplateTestRequest,
    channel: Type.Literal(ChannelType.Email),
    provider: Type.Optional(Type.Enum(EmailProviderType)),
  }),
  Type.Object({
    ...BaseMessageTemplateTestRequest,
    channel: Type.Literal(ChannelType.Sms),
    provider: Type.Optional(Type.Enum(SmsProviderType)),
  }),
  Type.Object({
    ...BaseMessageTemplateTestRequest,
    channel: Type.Literal(ChannelType.MobilePush),
    provider: Type.Optional(Type.Enum(MobilePushProviderType)),
  }),
]);

export type MessageTemplateTestRequest = Static<
  typeof MessageTemplateTestRequest
>;

export const MessageTemplateTestResponse = JsonResult(
  MessageSuccess,
  Type.Object({
    suggestions: Type.Array(Type.String()),
    responseData: Type.Optional(Type.String()),
  }),
);

export const GetTraitsRequest = Type.Object({
  workspaceId: Type.String(),
});

export type GetTraitsRequest = Static<typeof GetTraitsRequest>;

export const GetTraitsResponse = Type.Object({
  traits: Type.Array(Type.String()),
});

export type GetTraitsResponse = Static<typeof GetTraitsResponse>;

export const SearchDeliveriesRequest = Type.Object({
  workspaceId: Type.String(),
  fromIdentifier: Type.Optional(Type.String()),
  toIdentifier: Type.Optional(Type.String()),
  journeyId: Type.Optional(Type.String()),
  userId: Type.Optional(Type.String()),
  channel: Type.Optional(Type.Enum(ChannelType)),
  limit: Type.Optional(Type.Number()),
  cursor: Type.Optional(Type.String()),
});

export type SearchDeliveriesRequest = Static<typeof SearchDeliveriesRequest>;

const BaseDeliveryItem = Type.Object({
  sentAt: Type.String(),
  updatedAt: Type.String(),
  journeyId: Type.String(),
  userId: Type.String(),
  originMessageId: Type.String(),
  templateId: Type.String(),
});

export const SearchDeliveriesResponseItem = Type.Union([
  // TODO implement sms status
  Type.Composite([
    Type.Object({
      status: Type.String(),
      variant: MessageSmsSuccess,
    }),
    BaseDeliveryItem,
  ]),
  Type.Composite([
    Type.Object({
      status: EmailEvent,
      variant: MessageEmailSuccess,
    }),
    BaseDeliveryItem,
  ]),
  Type.Composite([
    Type.Object({
      status: EmailEvent,
      to: Type.String(),
      channel: Type.Literal(ChannelType.Email),
    }),
    Type.Partial(EmailContents),
    BaseDeliveryItem,
  ]),
]);

export type SearchDeliveriesResponseItem = Static<
  typeof SearchDeliveriesResponseItem
>;

export const SearchDeliveriesResponse = Type.Object({
  workspaceId: Type.String(),
  items: Type.Array(SearchDeliveriesResponseItem),
  cursor: Type.Optional(Type.String()),
  previousCursor: Type.Optional(Type.String()),
});

export type SearchDeliveriesResponse = Static<typeof SearchDeliveriesResponse>;

export const SendgridSecret = Type.Object({
  type: Type.Literal(EmailProviderType.Sendgrid),
  apiKey: Type.Optional(Type.String()),
  webhookKey: Type.Optional(Type.String()),
});

export type SendgridSecret = Static<typeof SendgridSecret>;

export const PostMarkSecret = Type.Object({
  type: Type.Literal(EmailProviderType.PostMark),
  apiKey: Type.Optional(Type.String()),
  webhookKey: Type.Optional(Type.String()),
});

export type PostMarkSecret = Static<typeof PostMarkSecret>;

export const AmazonSesSecret = Type.Object({
  type: Type.Literal(EmailProviderType.AmazonSes),
  accessKeyId: Type.Optional(Type.String()),
  secretAccessKey: Type.Optional(Type.String()),
  region: Type.Optional(Type.String()),
});

export type AmazonSesSecret = Static<typeof AmazonSesSecret>;

export type AmazonSesConfig = Required<
  Pick<AmazonSesSecret, "accessKeyId" | "secretAccessKey" | "region">
>;

export const AmazonSesMailFields = Type.Object({
  from: Type.String(),
  to: Type.String(),
  subject: Type.String(),
  html: Type.String(),
  replyTo: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Record(Type.String(), Type.String())),
  headers: Type.Optional(Type.Record(Type.String(), Type.String())),
});

export type AmazonSesMailFields = Static<typeof AmazonSesMailFields>;

export const TestEmailSecret = Type.Object({
  type: Type.Literal(EmailProviderType.Test),
});

export type TestEmailSecret = Static<typeof TestEmailSecret>;

export const ResendSecret = Type.Object({
  type: Type.Literal(EmailProviderType.Resend),
  apiKey: Type.Optional(Type.String()),
  webhookKey: Type.Optional(Type.String()),
});

export type ResendSecret = Static<typeof ResendSecret>;

export const SmtpSecret = Type.Object({
  type: Type.Literal(EmailProviderType.Smtp),
  host: Type.Optional(Type.String()),
  port: Type.Optional(Type.String()),
  username: Type.Optional(Type.String()),
  password: Type.Optional(Type.String()),
});

export type SmtpSecret = Static<typeof SmtpSecret>;

export type SmtpSecretKey = keyof Omit<SmtpSecret, "type">;

export const EmailProviderSecret = Type.Union([
  SendgridSecret,
  PostMarkSecret,
  AmazonSesSecret,
  SmtpSecret,
  ResendSecret,
  TestEmailSecret,
]);

export type EmailProviderSecret = Static<typeof EmailProviderSecret>;

export const DeleteUsersRequest = Type.Object({
  workspaceId: Type.String(),
  userIds: Type.Array(Type.String()),
});

export type DeleteUsersRequest = Static<typeof DeleteUsersRequest>;

export interface SubscriptionChangeEvent {
  type: EventType.Track;
  event: InternalEventType.SubscriptionChange;
  properties: {
    subscriptionId: string;
    action: SubscriptionChange;
  };
}

export interface SecretAvailabilityResource {
  workspaceId: string;
  name: string;
  value: boolean;
  configValue?: Record<string, boolean>;
}

export interface Resource {
  workspaceId: string;
  id: string;
}

export enum AdminApiKeyPermission {
  Admin = "Admin",
}

export enum AdminApiKeyType {
  AdminApiKey = "AdminApiKey",
}

export const AdminApiKeyDefinition = Type.Object({
  type: Type.Literal(AdminApiKeyType.AdminApiKey),
  key: Type.String(),
  permissions: Type.Array(
    Type.Union([Type.Literal(AdminApiKeyPermission.Admin)]),
  ),
});

export type AdminApiKeyDefinition = Static<typeof AdminApiKeyDefinition>;

export const CreateAdminApiKeyRequest = Type.Object({
  workspaceId: Type.String(),
  name: Type.String(),
});

export type CreateAdminApiKeyRequest = Static<typeof CreateAdminApiKeyRequest>;

export const CreateAdminApiKeyResponse = Type.Object({
  id: Type.String(),
  apiKey: Type.String(),
  name: Type.String(),
  workspaceId: Type.String(),
});

export type CreateAdminApiKeyResponse = Static<
  typeof CreateAdminApiKeyResponse
>;

export const DeleteAdminApiKeyRequest = Type.Object({
  workspaceId: Type.String(),
  id: Type.String(),
});

export type DeleteAdminApiKeyRequest = Static<typeof DeleteAdminApiKeyRequest>;

export enum JourneyConstraintViolationType {
  WaitForNodeAndEventEntryNode = "WaitForNodeAndEventEntryNode",
  CantStart = "CantStart",
}

export const JourneyConstraintViolation = Type.Object({
  type: Type.Enum(JourneyConstraintViolationType),
  message: Type.String(),
});

export type JourneyConstraintViolation = Static<
  typeof JourneyConstraintViolation
>;

export enum JourneyUpsertValidationErrorType {
  ConstraintViolation = "ConstraintViolation",
}

export const JourneyUpsertValidationConstraintViolationError = Type.Object({
  type: Type.Literal(JourneyUpsertValidationErrorType.ConstraintViolation),
  violations: Type.Array(JourneyConstraintViolation),
});

export type JourneyUpsertValidationConstraintViolationError = Static<
  typeof JourneyUpsertValidationConstraintViolationError
>;

export const JourneyUpsertValidationErrorVariant = Type.Union([
  JourneyUpsertValidationConstraintViolationError,
]);

export type JourneyUpsertValidationErrorVariant = Static<
  typeof JourneyUpsertValidationErrorVariant
>;

export const JourneyUpsertValidationError = Type.Object({
  message: Type.String(),
  variant: JourneyUpsertValidationErrorVariant,
});

export enum FeatureNamesEnum {
  DisplayJourneyPercentages = "DisplayJourneyPercentages",
}

export const FeatureNames = Type.Enum(FeatureNamesEnum);

export type FeatureMap = {
  [K in FeatureNamesEnum]?: boolean;
};
