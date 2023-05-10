import { SubscriptionGroup } from "@prisma/client";
import { ok, Result } from "neverthrow";

import {
  SubscriptionGroupResource,
  SubscriptionGroupType,
  UserSubscriptionsResource,
} from "./types";

export function subscriptionGroupToResource(
  subscriptionGroup: SubscriptionGroup
): SubscriptionGroupResource {
  const type: SubscriptionGroupType =
    subscriptionGroup.type === "OptIn"
      ? SubscriptionGroupType.OptIn
      : SubscriptionGroupType.OptOut;

  return {
    id: subscriptionGroup.id,
    workspaceId: subscriptionGroup.workspaceId,
    name: subscriptionGroup.name,
    type,
  };
}

export async function generateUnsubscribeLink({
  workspaceId,
  userId,
  subscriptionGroupId,
}: {
  userId: string;
  workspaceId: string;
  subscriptionGroupId: string;
}) {}

export async function validateSubscriptionHash({
  hash,
}: {
  hash: string;
}): Promise<Result<null, Error>> {
  return ok(null);
}

export async function changeSubscriptionStatus({
  workspaceId,
  subscriptionGroupId,
  identifier,
}: {
  workspaceId: string;
  subscriptionGroupId: string;
  identifier: string;
}) {}

export async function changeSubscriptionStatusProtected({
  workspaceId,
  identifier,
  subscriptionGroupId,
  hash,
}: {
  identifier: string;
  workspaceId: string;
  hash: string;
  subscriptionGroupId: string;
}): Promise<Result<null, Error>> {
  return ok(null);
}

export async function getUserSubscriptions({
  workspaceId,
  identifier,
  identifierKey,
}: {
  identifier: string;
  identifierKey: string;
  workspaceId: string;
}): Promise<UserSubscriptionsResource> {
  return {
    subscribed: [],
    unsubscribed: [],
  };
}
