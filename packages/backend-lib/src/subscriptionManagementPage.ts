import { eq } from "drizzle-orm";

import { db } from "./db";
import * as schema from "./db/schema";
import {
  DEFAULT_SUBSCRIPTION_TEMPLATE,
  renderSubscriptionManagementPage,
} from "./subscriptionManagementTemplate";
import {
  SubscriptionManagementChannel,
  SubscriptionManagementTemplateContext,
} from "./types";

export interface GenerateSubscriptionPageParams {
  workspaceId: string;
  workspaceName: string;
  subscriptions: Array<{
    id: string;
    name: string;
    isSubscribed: boolean;
    channel: string;
  }>;
  hash: string;
  identifier: string;
  identifierKey: string;
  isPreview: boolean;
  subscriptionChange?: "Subscribe" | "Unsubscribe";
  changedSubscriptionId?: string;
  changedSubscriptionChannel?: string;
  /** Form submission result - preferences saved successfully */
  success?: boolean;
  /** Form submission result - error occurred */
  error?: boolean;
  /** Form submission in preview mode - would have saved */
  previewSubmitted?: boolean;
}

/**
 * Generate the subscription management page HTML.
 * Uses a custom template if one exists for the workspace,
 * otherwise uses the default template.
 */
export async function generateSubscriptionManagementPage(
  params: GenerateSubscriptionPageParams,
): Promise<string> {
  const {
    workspaceId,
    workspaceName,
    subscriptions,
    hash,
    identifier,
    identifierKey,
    isPreview,
    subscriptionChange,
    changedSubscriptionId,
    changedSubscriptionChannel,
    success,
    error,
    previewSubmitted,
  } = params;

  // Get custom template if one exists
  const customTemplate =
    await db().query.subscriptionManagementTemplate.findFirst({
      where: eq(schema.subscriptionManagementTemplate.workspaceId, workspaceId),
    });

  // Group subscriptions by channel
  const channelMap = new Map<string, SubscriptionManagementChannel>();
  for (const sub of subscriptions) {
    let channel = channelMap.get(sub.channel);
    if (!channel) {
      channel = {
        name: sub.channel,
        subscriptions: [],
      };
      channelMap.set(sub.channel, channel);
    }
    channel.subscriptions.push({
      id: sub.id,
      name: sub.name,
      isSubscribed: sub.isSubscribed,
    });
  }

  const channels = Array.from(channelMap.values());

  // Find the changed subscription name if we have a changedSubscriptionId
  let changedSubscriptionName: string | undefined;
  if (changedSubscriptionId) {
    const changedSub = subscriptions.find((s) => s.id === changedSubscriptionId);
    changedSubscriptionName = changedSub?.name;
  }

  const context: SubscriptionManagementTemplateContext = {
    workspaceName,
    workspaceId,
    channels,
    hash,
    identifier,
    identifierKey,
    isPreview,
    subscriptionChange,
    changedSubscriptionName,
    changedSubscriptionChannel,
    success,
    error,
    previewSubmitted,
  };

  const template = customTemplate?.template ?? DEFAULT_SUBSCRIPTION_TEMPLATE;

  return renderSubscriptionManagementPage(context, template);
}
