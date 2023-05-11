import { SubscriptionGroup } from "@prisma/client";
import {
  SUBSCRIPTION_MANAGEMENT_PAGE,
  SUBSCRIPTION_SECRET_NAME,
} from "isomorphic-lib/src/constants";
import { err, ok, Result } from "neverthrow";
import { v4 as uuid } from "uuid";

import { generateSecureHash } from "./crypto";
import prisma from "./prisma";
import {
  InternalEventType,
  SubscriptionChange,
  SubscriptionGroupResource,
  SubscriptionGroupType,
  SubscriptionParams,
  UserSubscriptionsResource,
} from "./types";
import { InsertUserEvent } from "./userEvents";

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

export interface SubscriptionContext {
  workspaceId: string;
  userId: string;
  identifierKey: string;
  subscriptionSecret: string;
}

export async function getSubscriptionContext({
  subscriptionGroupId,
  identifier,
}: {
  subscriptionGroupId: string;
  identifier: string;
}): Promise<Result<SubscriptionContext, Error>> {
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

  return ok({
    workspaceId,
    userId,
    identifierKey,
    subscriptionSecret: subscriptionSecret.value,
  });
}

function generateSubscriptionHash({
  workspaceId,
  userId,
  identifierKey,
  identifier,
  subscriptionSecret,
}: {
  workspaceId: string;
  userId: string;
  identifierKey: string;
  identifier: string;
  subscriptionSecret: string;
}): string {
  const toHash = {
    u: userId,
    w: workspaceId,
    i: identifier,
    k: identifierKey,
  };

  const hash = generateSecureHash({
    key: subscriptionSecret,
    value: toHash,
  });
  return hash;
}

export async function generateSubscriptionChangeUrl({
  i,
  s,
  sub,
}: SubscriptionParams): Promise<Result<string, Error>> {
  const context = await getSubscriptionContext({
    identifier: i,
    subscriptionGroupId: s,
  });

  if (context.isErr()) {
    return err(context.error);
  }
  const { workspaceId, userId, identifierKey, subscriptionSecret } =
    context.value;

  const hash = generateSubscriptionHash({
    workspaceId,
    userId,
    identifierKey,
    identifier: i,
    subscriptionSecret,
  });

  const params: SubscriptionParams = {
    i,
    s,
    h: hash,
    sub: sub ? "1" : "0",
  };
  const queryString = new URLSearchParams(params).toString();
  const url = `${SUBSCRIPTION_MANAGEMENT_PAGE}?${queryString}`;
  return ok(url);
}

export async function validateSubscriptionHash({
  h,
  s,
  i,
}: Omit<SubscriptionParams, "sub">): Promise<Result<boolean, Error>> {
  const context = await getSubscriptionContext({
    identifier: i,
    subscriptionGroupId: s,
  });

  if (context.isErr()) {
    return err(context.error);
  }
  const { workspaceId, userId, identifierKey, subscriptionSecret } =
    context.value;

  const hash = generateSubscriptionHash({
    workspaceId,
    userId,
    identifierKey,
    identifier: i,
    subscriptionSecret,
  });
  return ok(hash === h);
}

export function buildSubscriptionChangeEvent({
  messageId = uuid(),
  userId,
  action,
  subscriptionGroupId,
  currentTime = new Date(),
}: {
  userId: string;
  messageId?: string;
  subscriptionGroupId: string;
  currentTime?: Date;
  action: SubscriptionChange;
}): InsertUserEvent {
  const timestamp = currentTime.toISOString();
  return {
    messageId,
    messageRaw: JSON.stringify({
      userId,
      timestamp,
      type: "track",
      event: InternalEventType.SubscriptionChange,
      properties: {
        subscriptionId: subscriptionGroupId,
        action,
      },
    }),
  };
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
