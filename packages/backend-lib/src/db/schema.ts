import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const computedPropertyType = pgEnum("ComputedPropertyType", [
  "Segment",
  "UserProperty",
]);
export const dbBroadcastStatus = pgEnum("DBBroadcastStatus", [
  "NotStarted",
  "InProgress",
  "Triggered",
]);
export const dbBroadcastStatusV2 = pgEnum("DBBroadcastStatusV2", [
  "Draft",
  "Scheduled",
  "Running",
  "Paused",
  "Completed",
  "Cancelled",
  "Failed",
]);
export const dbBroadcastVersion = pgEnum("DBBroadcastVersion", ["V1", "V2"]);
export const dbChannelType = pgEnum("DBChannelType", [
  "Email",
  "MobilePush",
  "Sms",
  "Webhook",
]);
export const dbCompletionStatus = pgEnum("DBCompletionStatus", [
  "NotStarted",
  "InProgress",
  "Successful",
  "Failed",
]);
export const dbResourceType = pgEnum("DBResourceType", [
  "Declarative",
  "Internal",
]);
export const dbRoleType = pgEnum("DBRoleType", [
  "Admin",
  "WorkspaceManager",
  "Author",
  "Viewer",
]);
export const dbSubscriptionGroupType = pgEnum("DBSubscriptionGroupType", [
  "OptIn",
  "OptOut",
]);
export const journeyStatus = pgEnum("JourneyStatus", [
  "NotStarted",
  "Running",
  "Paused",
  "Broadcast",
]);
export const segmentStatus = pgEnum("SegmentStatus", [
  "NotStarted",
  "Running",
  "Paused",
]);
export const userPropertyStatus = pgEnum("UserPropertyStatus", [
  "NotStarted",
  "Running",
  "Paused",
]);
export const workspaceStatus = pgEnum("WorkspaceStatus", [
  "Active",
  "Tombstoned",
  "Paused",
]);
export const workspaceType = pgEnum("WorkspaceType", [
  "Root",
  "Child",
  "Parent",
]);

export const workspace = pgTable(
  "Workspace",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    name: text().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    domain: text(),
    type: workspaceType().default("Root").notNull(),
    externalId: text(),
    parentWorkspaceId: uuid(),
    status: workspaceStatus().default("Active").notNull(),
  },
  (table) => [
    unique("Workspace_parentWorkspaceId_externalId_key").on(
      table.parentWorkspaceId,
      table.externalId,
    ),
    unique("Workspace_parentWorkspaceId_name_key")
      .on(table.parentWorkspaceId, table.name)
      .nullsNotDistinct(),
  ],
);

export const segmentIoConfiguration = pgTable(
  "SegmentIOConfiguration",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    sharedSecret: text().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("SegmentIOConfiguration_workspaceId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "SegmentIOConfiguration_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const userProperty = pgTable(
  "UserProperty",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    definition: jsonb().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    resourceType: dbResourceType().default("Declarative").notNull(),
    definitionUpdatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    status: userPropertyStatus().default("Running").notNull(),
    exampleValue: text(),
  },
  (table) => [
    uniqueIndex("UserProperty_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "UserProperty_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const userPropertyAssignment = pgTable(
  "UserPropertyAssignment",
  {
    userId: text().notNull(),
    userPropertyId: uuid().notNull(),
    value: text().notNull(),
    workspaceId: uuid().notNull(),
  },
  (table) => [
    index("UserPropertyAssignment_userId_idx").using(
      "btree",
      table.userId.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex(
      "UserPropertyAssignment_workspaceId_userPropertyId_userId_key",
    ).using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.userPropertyId.asc().nullsLast().op("uuid_ops"), // Already correct
      table.userId.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "UserPropertyAssignment_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.userPropertyId],
      foreignColumns: [userProperty.id],
      name: "UserPropertyAssignment_userPropertyId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const emailProvider = pgTable(
  "EmailProvider",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    type: text().notNull(),
    apiKey: text(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    secretId: uuid(),
  },
  (table) => [
    uniqueIndex("EmailProvider_workspaceId_type_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.type.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "EmailProvider_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.secretId],
      foreignColumns: [secret.id],
      name: "EmailProvider_secretId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const userJourneyEvent = pgTable(
  "UserJourneyEvent",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    userId: text().notNull(),
    journeyId: uuid(),
    type: text().notNull(),
    journeyStartedAt: timestamp({ precision: 3, mode: "date" }).notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    nodeId: text(),
    eventKey: text(),
    eventKeyName: text(),
  },
  (table) => [
    uniqueIndex(
      "UserJourneyEvent_journeyId_userId_eventKey_eventKeyName_typ_key",
    ).using(
      "btree",
      table.journeyId.asc().nullsLast().op("uuid_ops"), // Change from timestamp_ops
      table.userId.asc().nullsLast().op("text_ops"), // Change from uuid_ops
      table.eventKey.asc().nullsLast().op("text_ops"), // Change from uuid_ops
      table.eventKeyName.asc().nullsLast().op("text_ops"),
      table.type.asc().nullsLast().op("text_ops"), // Change from timestamp_ops
      table.journeyStartedAt.asc().nullsLast().op("timestamp_ops"), // Change from text_ops
      table.nodeId.asc().nullsLast().op("text_ops"), // Change from timestamp_ops
    ),
  ],
);

export const emailTemplate = pgTable(
  "EmailTemplate",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    from: text().notNull(),
    subject: text().notNull(),
    body: text().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    replyTo: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "EmailTemplate_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const subscriptionGroup = pgTable(
  "SubscriptionGroup",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    type: dbSubscriptionGroupType().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    channel: dbChannelType().notNull(),
  },
  (table) => [
    index("SubscriptionGroup_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    uniqueIndex("SubscriptionGroup_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "SubscriptionGroup_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const defaultEmailProvider = pgTable(
  "DefaultEmailProvider",
  {
    workspaceId: uuid().notNull(),
    emailProviderId: uuid().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    fromAddress: text(),
  },
  (table) => [
    uniqueIndex("DefaultEmailProvider_workspaceId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "DefaultEmailProvider_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.emailProviderId],
      foreignColumns: [emailProvider.id],
      name: "DefaultEmailProvider_emailProviderId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const broadcast = pgTable(
  "Broadcast",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    triggeredAt: timestamp({ precision: 3, mode: "date" }),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    journeyId: uuid(),
    messageTemplateId: uuid(),
    segmentId: uuid(),
    subscriptionGroupId: uuid(),
    status: dbBroadcastStatus().default("NotStarted"),
    statusV2: dbBroadcastStatusV2().default("Draft"),
    scheduledAt: timestamp({
      precision: 3,
      mode: "string",
      withTimezone: false,
    }),
    version: dbBroadcastVersion().default("V1"),
    archived: boolean().default(false).notNull(),
    config: jsonb(),
  },
  (table) => [
    uniqueIndex("Broadcast_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.segmentId],
      foreignColumns: [segment.id],
      name: "Broadcast_segmentId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.journeyId],
      foreignColumns: [journey.id],
      name: "Broadcast_journeyId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "Broadcast_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.messageTemplateId],
      foreignColumns: [messageTemplate.id],
      name: "Broadcast_messageTemplateId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("set null"),
  ],
);

export const segmentAssignment = pgTable(
  "SegmentAssignment",
  {
    userId: text().notNull(),
    inSegment: boolean().notNull(),
    workspaceId: uuid().notNull(),
    segmentId: uuid().notNull(),
  },
  (table) => [
    uniqueIndex("SegmentAssignment_workspaceId_userId_segmentId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.userId.asc().nullsLast().op("text_ops"),
      table.segmentId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "SegmentAssignment_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.segmentId],
      foreignColumns: [segment.id],
      name: "SegmentAssignment_segmentId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const workspaceMemberRole = pgTable(
  "WorkspaceMemberRole",
  {
    workspaceId: uuid().notNull(),
    workspaceMemberId: uuid().notNull(),
    role: dbRoleType().default("Viewer").notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("WorkspaceMemberRole_workspaceId_workspaceMemberId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.workspaceMemberId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "WorkspaceMemberRole_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceMemberId],
      foreignColumns: [workspaceMember.id],
      name: "WorkspaceMemberRole_workspaceMemberId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const workspaceMemberSetting = pgTable(
  "WorkspaceMemberSetting",
  {
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    workspaceMemberId: uuid().notNull(),
    config: jsonb(),
    secretId: uuid(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex(
      "WorkspaceMemberSetting_workspaceId_workspaceMemberId_key",
    ).using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.workspaceMemberId.asc().nullsLast().op("uuid_ops"),
    ),
    uniqueIndex("WorkspaceMemberSetting_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "WorkspaceMemberSetting_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceMemberId],
      foreignColumns: [workspaceMember.id],
      name: "WorkspaceMemberSetting_workspaceMemberId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.secretId],
      foreignColumns: [secret.id],
      name: "WorkspaceMemberSetting_secretId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("set null"),
  ],
);

export const secret = pgTable(
  "Secret",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    value: text(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    configValue: jsonb(),
  },
  (table) => [
    uniqueIndex("Secret_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "Secret_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const workspaceMembeAccount = pgTable(
  "WorkspaceMembeAccount",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceMemberId: uuid().notNull(),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("WorkspaceMembeAccount_provider_providerAccountId_key").using(
      "btree",
      table.provider.asc().nullsLast().op("text_ops"),
      table.providerAccountId.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceMemberId],
      foreignColumns: [workspaceMember.id],
      name: "WorkspaceMembeAccount_workspaceMemberId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const messageTemplate = pgTable(
  "MessageTemplate",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    definition: jsonb(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    resourceType: dbResourceType().default("Declarative").notNull(),
    draft: jsonb(),
  },
  (table) => [
    uniqueIndex("MessageTemplate_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "MessageTemplate_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const integration = pgTable(
  "Integration",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    definition: jsonb().notNull(),
    enabled: boolean().default(true).notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    definitionUpdatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("Integration_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "Integration_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const writeKey = pgTable(
  "WriteKey",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    secretId: uuid().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("WriteKey_workspaceId_secretId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.secretId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "WriteKey_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.secretId],
      foreignColumns: [secret.id],
      name: "WriteKey_secretId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const oauthToken = pgTable(
  "OauthToken",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    refreshToken: text().notNull(),
    accessToken: text().notNull(),
    expiresIn: integer().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("OauthToken_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "OauthToken_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const workspaceMember = pgTable(
  "WorkspaceMember",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    email: text(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    name: text(),
    nickname: text(),
    lastWorkspaceId: uuid(),
  },
  (table) => [
    uniqueIndex("WorkspaceMember_email_key").using(
      "btree",
      table.email.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.lastWorkspaceId],
      foreignColumns: [workspace.id],
      name: "WorkspaceMember_lastWorkspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("set null"),
  ],
);

export const segment = pgTable(
  "Segment",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    definition: jsonb().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    resourceType: dbResourceType().default("Declarative").notNull(),
    subscriptionGroupId: uuid(),
    status: segmentStatus().default("Running").notNull(),
    definitionUpdatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("Segment_resourceType_idx").using(
      "btree",
      table.resourceType.asc().nullsLast().op("enum_ops"),
    ),
    uniqueIndex("Segment_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "Segment_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.subscriptionGroupId],
      foreignColumns: [subscriptionGroup.id],
      name: "Segment_subscriptionGroupId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("set null"),
  ],
);

export const defaultSmsProvider = pgTable(
  "DefaultSmsProvider",
  {
    workspaceId: uuid().notNull(),
    smsProviderId: uuid().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("DefaultSmsProvider_workspaceId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "DefaultSmsProvider_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.smsProviderId],
      foreignColumns: [smsProvider.id],
      name: "DefaultSmsProvider_smsProviderId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const smsProvider = pgTable(
  "SmsProvider",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    secretId: uuid().notNull(),
    type: text().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("SmsProvider_workspaceId_type_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.type.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "SmsProvider_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.secretId],
      foreignColumns: [secret.id],
      name: "SmsProvider_secretId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const journey = pgTable(
  "Journey",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    status: journeyStatus().default("NotStarted").notNull(),
    definition: jsonb(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    resourceType: dbResourceType().default("Declarative").notNull(),
    canRunMultiple: boolean().default(false).notNull(),
    draft: jsonb(),
    statusUpdatedAt: timestamp({ precision: 3, mode: "date" }),
  },
  (table) => [
    uniqueIndex("Journey_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "Journey_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const computedPropertyPeriod = pgTable(
  "ComputedPropertyPeriod",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    type: computedPropertyType().notNull(),
    computedPropertyId: uuid().notNull(),
    version: text().notNull(),
    from: timestamp({ precision: 3, mode: "date" }),
    to: timestamp({ precision: 3, mode: "date" }).notNull(),
    step: text().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index(
      "ComputedPropertyPeriod_workspaceId_type_computedPropertyId__idx",
    ).using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.type.asc().nullsLast().op("enum_ops"), // Change from uuid_ops
      table.computedPropertyId.asc().nullsLast().op("uuid_ops"),
      table.to.asc().nullsLast().op("timestamp_ops"), // Change from uuid_ops
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "ComputedPropertyPeriod_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const adminApiKey = pgTable(
  "AdminApiKey",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    secretId: uuid().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("AdminApiKey_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "AdminApiKey_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.secretId],
      foreignColumns: [secret.id],
      name: "AdminApiKey_secretId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const feature = pgTable(
  "Feature",
  {
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    enabled: boolean().default(false).notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    config: jsonb(),
  },
  (table) => [
    uniqueIndex("Feature_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "Feature_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

// deprecated
export const workspaceRelation = pgTable(
  "WorkspaceRelation",
  {
    parentWorkspaceId: uuid().notNull(),
    childWorkspaceId: uuid().notNull(),
  },
  (table) => [
    uniqueIndex(
      "WorkspaceRelation_parentWorkspaceId_childWorkspaceId_key",
    ).using(
      "btree",
      table.parentWorkspaceId.asc().nullsLast().op("uuid_ops"),
      table.childWorkspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.parentWorkspaceId],
      foreignColumns: [workspace.id],
      name: "WorkspaceRelation_parentWorkspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.childWorkspaceId],
      foreignColumns: [workspace.id],
      name: "WorkspaceRelation_childWorkspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const componentConfiguration = pgTable(
  "ComponentConfiguration",
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    workspaceId: uuid().notNull(),
    name: text().notNull(),
    definition: jsonb().notNull(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("ComponentConfiguration_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"), // Change from text_ops
      table.name.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspace.id],
      name: "ComponentConfiguration_workspaceId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);
