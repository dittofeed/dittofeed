import { relations } from "drizzle-orm/relations";

import {
  adminApiKey,
  broadcast,
  componentConfiguration,
  computedPropertyPeriod,
  defaultEmailProvider,
  defaultSmsProvider,
  emailProvider,
  emailTemplate,
  feature,
  integration,
  journey,
  messageTemplate,
  oauthToken,
  secret,
  segment,
  segmentAssignment,
  segmentIoConfiguration,
  smsProvider,
  subscriptionGroup,
  timeLimitedCache,
  userProperty,
  userPropertyAssignment,
  workspace,
  workspaceMembeAccount,
  workspaceMember,
  workspaceMemberRole,
  workspaceOccupantSetting,
  workspaceRelation,
  writeKey,
} from "./schema";

export const segmentIoConfigurationRelations = relations(
  segmentIoConfiguration,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [segmentIoConfiguration.workspaceId],
      references: [workspace.id],
    }),
  }),
);

export const workspaceRelations = relations(workspace, ({ many }) => ({
  segmentIoConfigurations: many(segmentIoConfiguration),
  userProperties: many(userProperty),
  userPropertyAssignments: many(userPropertyAssignment),
  emailProviders: many(emailProvider),
  emailTemplates: many(emailTemplate),
  subscriptionGroups: many(subscriptionGroup),
  defaultEmailProviders: many(defaultEmailProvider),
  broadcasts: many(broadcast),
  segmentAssignments: many(segmentAssignment),
  workspaceMemberRoles: many(workspaceMemberRole),
  secrets: many(secret),
  messageTemplates: many(messageTemplate),
  integrations: many(integration),
  writeKeys: many(writeKey),
  oauthTokens: many(oauthToken),
  workspaceMembers: many(workspaceMember),
  segments: many(segment),
  defaultSmsProviders: many(defaultSmsProvider),
  smsProviders: many(smsProvider),
  journeys: many(journey),
  computedPropertyPeriods: many(computedPropertyPeriod),
  adminApiKeys: many(adminApiKey),
  features: many(feature),
  workspaceRelations_parentWorkspaceId: many(workspaceRelation, {
    relationName: "workspaceRelation_parentWorkspaceId_workspace_id",
  }),
  workspaceRelations_childWorkspaceId: many(workspaceRelation, {
    relationName: "workspaceRelation_childWorkspaceId_workspace_id",
  }),
  componentConfigurations: many(componentConfiguration),
  workspaceOccupantSettings: many(workspaceOccupantSetting),
  timeLimitedCaches: many(timeLimitedCache),
}));

export const userPropertyRelations = relations(
  userProperty,
  ({ one, many }) => ({
    workspace: one(workspace, {
      fields: [userProperty.workspaceId],
      references: [workspace.id],
    }),
    userPropertyAssignments: many(userPropertyAssignment),
  }),
);

export const userPropertyAssignmentRelations = relations(
  userPropertyAssignment,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [userPropertyAssignment.workspaceId],
      references: [workspace.id],
    }),
    userProperty: one(userProperty, {
      fields: [userPropertyAssignment.userPropertyId],
      references: [userProperty.id],
    }),
  }),
);

export const emailProviderRelations = relations(
  emailProvider,
  ({ one, many }) => ({
    workspace: one(workspace, {
      fields: [emailProvider.workspaceId],
      references: [workspace.id],
    }),
    secret: one(secret, {
      fields: [emailProvider.secretId],
      references: [secret.id],
    }),
    defaultEmailProviders: many(defaultEmailProvider),
  }),
);

export const secretRelations = relations(secret, ({ one, many }) => ({
  emailProviders: many(emailProvider),
  workspace: one(workspace, {
    fields: [secret.workspaceId],
    references: [workspace.id],
  }),
  writeKeys: many(writeKey),
  smsProviders: many(smsProvider),
  adminApiKeys: many(adminApiKey),
  workspaceOccupantSettings: many(workspaceOccupantSetting),
}));

export const emailTemplateRelations = relations(emailTemplate, ({ one }) => ({
  workspace: one(workspace, {
    fields: [emailTemplate.workspaceId],
    references: [workspace.id],
  }),
}));

export const subscriptionGroupRelations = relations(
  subscriptionGroup,
  ({ one, many }) => ({
    workspace: one(workspace, {
      fields: [subscriptionGroup.workspaceId],
      references: [workspace.id],
    }),
    segments: many(segment),
  }),
);

export const defaultEmailProviderRelations = relations(
  defaultEmailProvider,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [defaultEmailProvider.workspaceId],
      references: [workspace.id],
    }),
    emailProvider: one(emailProvider, {
      fields: [defaultEmailProvider.emailProviderId],
      references: [emailProvider.id],
    }),
  }),
);

export const broadcastRelations = relations(broadcast, ({ one }) => ({
  segment: one(segment, {
    fields: [broadcast.segmentId],
    references: [segment.id],
  }),
  journey: one(journey, {
    fields: [broadcast.journeyId],
    references: [journey.id],
  }),
  workspace: one(workspace, {
    fields: [broadcast.workspaceId],
    references: [workspace.id],
  }),
  messageTemplate: one(messageTemplate, {
    fields: [broadcast.messageTemplateId],
    references: [messageTemplate.id],
  }),
}));

export const segmentRelations = relations(segment, ({ one, many }) => ({
  broadcasts: many(broadcast),
  segmentAssignments: many(segmentAssignment),
  workspace: one(workspace, {
    fields: [segment.workspaceId],
    references: [workspace.id],
  }),
  subscriptionGroup: one(subscriptionGroup, {
    fields: [segment.subscriptionGroupId],
    references: [subscriptionGroup.id],
  }),
}));

export const journeyRelations = relations(journey, ({ one, many }) => ({
  broadcasts: many(broadcast),
  workspace: one(workspace, {
    fields: [journey.workspaceId],
    references: [workspace.id],
  }),
}));

export const messageTemplateRelations = relations(
  messageTemplate,
  ({ one, many }) => ({
    broadcasts: many(broadcast),
    workspace: one(workspace, {
      fields: [messageTemplate.workspaceId],
      references: [workspace.id],
    }),
  }),
);

export const segmentAssignmentRelations = relations(
  segmentAssignment,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [segmentAssignment.workspaceId],
      references: [workspace.id],
    }),
    segment: one(segment, {
      fields: [segmentAssignment.segmentId],
      references: [segment.id],
    }),
  }),
);

export const workspaceMemberRoleRelations = relations(
  workspaceMemberRole,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [workspaceMemberRole.workspaceId],
      references: [workspace.id],
    }),
    workspaceMember: one(workspaceMember, {
      fields: [workspaceMemberRole.workspaceMemberId],
      references: [workspaceMember.id],
    }),
  }),
);

export const workspaceMemberRelations = relations(
  workspaceMember,
  ({ one, many }) => ({
    workspaceMemberRoles: many(workspaceMemberRole),
    workspaceMembeAccounts: many(workspaceMembeAccount),
    workspace: one(workspace, {
      fields: [workspaceMember.lastWorkspaceId],
      references: [workspace.id],
    }),
  }),
);

export const workspaceMembeAccountRelations = relations(
  workspaceMembeAccount,
  ({ one }) => ({
    workspaceMember: one(workspaceMember, {
      fields: [workspaceMembeAccount.workspaceMemberId],
      references: [workspaceMember.id],
    }),
  }),
);

export const integrationRelations = relations(integration, ({ one }) => ({
  workspace: one(workspace, {
    fields: [integration.workspaceId],
    references: [workspace.id],
  }),
}));

export const writeKeyRelations = relations(writeKey, ({ one }) => ({
  workspace: one(workspace, {
    fields: [writeKey.workspaceId],
    references: [workspace.id],
  }),
  secret: one(secret, {
    fields: [writeKey.secretId],
    references: [secret.id],
  }),
}));

export const oauthTokenRelations = relations(oauthToken, ({ one }) => ({
  workspace: one(workspace, {
    fields: [oauthToken.workspaceId],
    references: [workspace.id],
  }),
}));

export const defaultSmsProviderRelations = relations(
  defaultSmsProvider,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [defaultSmsProvider.workspaceId],
      references: [workspace.id],
    }),
    smsProvider: one(smsProvider, {
      fields: [defaultSmsProvider.smsProviderId],
      references: [smsProvider.id],
    }),
  }),
);

export const smsProviderRelations = relations(smsProvider, ({ one, many }) => ({
  defaultSmsProviders: many(defaultSmsProvider),
  workspace: one(workspace, {
    fields: [smsProvider.workspaceId],
    references: [workspace.id],
  }),
  secret: one(secret, {
    fields: [smsProvider.secretId],
    references: [secret.id],
  }),
}));

export const computedPropertyPeriodRelations = relations(
  computedPropertyPeriod,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [computedPropertyPeriod.workspaceId],
      references: [workspace.id],
    }),
  }),
);

export const adminApiKeyRelations = relations(adminApiKey, ({ one }) => ({
  workspace: one(workspace, {
    fields: [adminApiKey.workspaceId],
    references: [workspace.id],
  }),
  secret: one(secret, {
    fields: [adminApiKey.secretId],
    references: [secret.id],
  }),
}));

export const featureRelations = relations(feature, ({ one }) => ({
  workspace: one(workspace, {
    fields: [feature.workspaceId],
    references: [workspace.id],
  }),
}));

export const workspaceRelationRelations = relations(
  workspaceRelation,
  ({ one }) => ({
    workspace_parentWorkspaceId: one(workspace, {
      fields: [workspaceRelation.parentWorkspaceId],
      references: [workspace.id],
      relationName: "workspaceRelation_parentWorkspaceId_workspace_id",
    }),
    workspace_childWorkspaceId: one(workspace, {
      fields: [workspaceRelation.childWorkspaceId],
      references: [workspace.id],
      relationName: "workspaceRelation_childWorkspaceId_workspace_id",
    }),
  }),
);

export const workspaceOccupantSettingRelations = relations(
  workspaceOccupantSetting,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [workspaceOccupantSetting.workspaceId],
      references: [workspace.id],
    }),
    secret: one(secret, {
      fields: [workspaceOccupantSetting.secretId],
      references: [secret.id],
    }),
  }),
);

export const timeLimitedCacheRelations = relations(
  timeLimitedCache,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [timeLimitedCache.workspaceId],
      references: [workspace.id],
    }),
  }),
);
