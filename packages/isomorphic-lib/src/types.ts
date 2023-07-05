import { Static, TSchema, Type } from "@sinclair/typebox";

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

export const JsonResult = <T extends TSchema, E extends TSchema>(
  resultType: T,
  errorType: E
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

export enum SubscriptionGroupType {
  OptIn = "OptIn",
  OptOut = "OptOut",
}

export enum ChannelType {
  Email = "Email",
  MobilePush = "MobilePush",
}

export const SubscriptionGroupResource = Type.Object({
  id: Type.String(),
  workspaceId: Type.String(),
  name: Type.String(),
  channel: Type.Enum(ChannelType),
  type: Type.Enum(SubscriptionGroupType),
  createdAt: Type.Optional(Type.Number()),
});

export type SubscriptionGroupResource = Static<
  typeof SubscriptionGroupResource
>;

export interface SegmentUpdate {
  segmentId: string;
  currentlyInSegment: boolean;
  segmentVersion: number;
}

export enum SegmentOperatorType {
  Within = "Within",
  Equals = "Equals",
  HasBeen = "HasBeen",
  NotEquals = "NotEquals",
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

export const PerformedSegmentNode = Type.Object({
  type: Type.Literal(SegmentNodeType.Performed),
  id: Type.String(),
  event: Type.String(),
  times: Type.Optional(Type.Number()),
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
      }
    )
  ),
  hasProperties: Type.Array(
    Type.Object({
      path: Type.String(),
      operator: SegmentOperator,
    }),
    {
      description:
        "Used to evaluate whether the user is in the segment based on the properties of the selected event.",
    }
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
  WaitForNode = "WaitForNode",
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

export const WaitForNode = Type.Object(
  {
    type: Type.Literal(JourneyNodeType.WaitForNode),
    timeoutChild: Type.String(),
    segmentChildren: Type.Array(
      Type.Object({
        child: Type.String(),
        segmentId: Type.String(),
      })
    ),
  },
  {
    title: "Wait For Node",
    description:
      "A node which waits for a user to enter a segment before progressing.",
  }
);

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

export const EmailPayload = Type.Object({
  from: Type.String(),
  to: Type.String(),
  subject: Type.String(),
  body: Type.String(),
});

export type EmailPayload = Static<typeof EmailPayload>;

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

export const MessageVariant = Type.Union([
  EmailMessageVariant,
  MobilePushMessageVariant,
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
});

export type SegmentResource = Static<typeof SegmentResource>;

export const UpsertSubscriptionGroupResource = Type.Intersect([
  Type.Omit(SubscriptionGroupResource, ["id"]),
  Type.Pick(Type.Partial(SubscriptionGroupResource), ["id"]),
]);

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

export const EmailTemplateResource = Type.Object({
  type: Type.Literal(ChannelType.Email),
  from: Type.String(),
  subject: Type.String(),
  body: Type.String(),
});

export type EmailTemplateResource = Static<typeof EmailTemplateResource>;

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
    })
  ),
});

export type MobilePushTemplateResource = Static<
  typeof MobilePushTemplateResource
>;

export const MessageTemplateResourceDefinition = Type.Union([
  MobilePushTemplateResource,
  EmailTemplateResource,
]);

export type MessageTemplateResourceDefinition = Static<
  typeof MessageTemplateResourceDefinition
>;

const MessageTemplateResourceProperties = {
  workspaceId: Type.String(),
  id: Type.String(),
  name: Type.String(),
  definition: MessageTemplateResourceDefinition,
} as const;

export const MessageTemplateResource = Type.Object(
  MessageTemplateResourceProperties
);

export type MessageTemplateResource = Static<typeof MessageTemplateResource>;

export type NarrowedMessageTemplateResource<
  T extends MessageTemplateResourceDefinition
> = Omit<MessageTemplateResource, "definition"> & {
  definition: T;
};

export const UpsertMessageTemplateResource = Type.Object({
  workspaceId: Type.Optional(Type.String()),
  id: Type.String(),
  name: Type.Optional(Type.String()),
  definition: MessageTemplateResourceDefinition,
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
});

export type UserPropertyResource = Static<typeof UserPropertyResource>;

export const UpsertUserPropertyResource = Type.Intersect([
  Type.Omit(Type.Partial(UserPropertyResource), ["id", "name"]),
  Type.Pick(UserPropertyResource, ["id", "name"]),
]);

export type UpsertUserPropertyResource = Static<
  typeof UpsertUserPropertyResource
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
  workspaceId: Type.String(),
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
      })
    ),
    sub: Type.Optional(
      Type.Union([
        Type.Literal("1", {
          description: "Subscribing user to subscription group.",
        }),
        Type.Literal("0", {
          description: "Unsubscribing user from subscription group.",
        }),
      ])
    ),
  },
  {
    description:
      "Subscription management parameters with shorted parameter names for efficient query param serialization.",
  }
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

export const RenderMessageTemplateRequest = Type.Object({
  workspaceId: Type.String(),
  channel: Type.Enum(ChannelType),
  subscriptionGroupId: Type.Optional(Type.String()),
  contents: Type.Record(
    Type.String(),
    Type.Object({
      value: Type.String(),
      mjml: Type.Optional(Type.Boolean()),
    })
  ),
  userProperties: Type.Record(Type.String(), Type.String()),
});

export type RenderMessageTemplateRequest = Static<
  typeof RenderMessageTemplateRequest
>;

export const RenderMessageTemplateResponseContent = JsonResult(
  Type.String(),
  Type.String()
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
  Type.Record(Type.String(), Type.Any())
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
  userId: Type.String(),
});

export type AnonymousIdentifyData = Static<typeof AnonymousIdentifyData>;

export const IdentifyData = Type.Union([
  KnownIdentifyData,
  AnonymousIdentifyData,
]);

export type IdentifyData = Static<typeof IdentifyData>;

export const BatchIdentifyData = Type.Union([
  Type.Object({
    ...BaseBatchIdentifyData,
    userId: Type.String(),
  }),
  Type.Object({
    ...BaseBatchIdentifyData,
    anonymousId: Type.String(),
  }),
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

export const BatchTrackData = Type.Union([
  Type.Object({
    ...BaseBatchTrackData,
    userId: Type.String(),
  }),
  Type.Object({
    ...BaseBatchTrackData,
    anonymousId: Type.String(),
  }),
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

export const BatchAppData = Type.Object({
  batch: Type.Array(BatchItem),
  context: AppDataContext,
});

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
  value: Type.String(),
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
