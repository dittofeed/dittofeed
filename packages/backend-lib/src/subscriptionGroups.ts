import { SubscriptionGroup } from "@prisma/client";
import {
  SUBSCRIPTION_MANAGEMENT_PAGE,
  SUBSCRIPTION_SECRET_NAME,
} from "isomorphic-lib/src/constants";
import { err, ok, Result } from "neverthrow";

import { generateSecureHash } from "./crypto";
import prisma from "./prisma";
import {
  SubscriptionGroupResource,
  SubscriptionGroupType,
  SubscriptionParams,
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

export async function generateSubscriptionChangeUrl({
  identifier,
  subscriptionGroupId,
  subscribed,
}: {
  identifier: string;
  subscriptionGroupId: string;
  subscribed: boolean;
}): Promise<Result<string, Error>> {
  const subscriptionGroup = await prisma().subscriptionGroup.findUnique({
    where: {
      id: subscriptionGroupId,
    },
    include: {
      channel: true,
    },
  });
  if (!subscriptionGroup) {
    return err(new Error("Subscription group not found"));
  }
  const { workspaceId } = subscriptionGroup;
  const identifierKey = subscriptionGroup.channel.identifier;

  const [subscriptionSecret, userProperties] = await Promise.all([
    prisma().secret.findUnique({
      where: {
        workspaceId_name: {
          name: SUBSCRIPTION_SECRET_NAME,
          workspaceId,
        },
      },
    }),
    prisma().userProperty.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: identifierKey,
        },
      },
      include: {
        UserPropertyAssignment: {
          where: {
            value: identifier,
          },
        },
      },
    }),
  ]);

  const userPropertyAssignment = userProperties?.UserPropertyAssignment[0];
  if (!userPropertyAssignment) {
    return err(new Error("User not found"));
  }

  if (!subscriptionSecret) {
    return err(new Error("Subscription secret not found"));
  }

  const { userId } = userPropertyAssignment;

  const toHash = {
    userId,
    workspaceId,
    identifier,
    identifierKey,
  };

  const hash = generateSecureHash({
    key: subscriptionSecret.value,
    value: toHash,
  });

  const params: SubscriptionParams = {
    i: identifier,
    s: subscriptionGroupId,
    h: hash,
    sub: subscribed ? "1" : "0",
  };
  const queryString = new URLSearchParams(params).toString();
  const url = `${SUBSCRIPTION_MANAGEMENT_PAGE}?${queryString}`;
  return ok(url);
}

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
