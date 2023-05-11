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
  UserSubscriptionResource,
} from "./types";
import { InsertUserEvent, insertUserEvents } from "./userEvents";

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
  userId: string;
  identifierKey: string;
  subscriptionSecret: string;
  segmentId: string;
}

export async function getSubscriptionContext({
  workspaceId,
  subscriptionGroupId,
  identifier,
}: {
  workspaceId: string;
  subscriptionGroupId: string;
  identifier: string;
}): Promise<Result<SubscriptionContext, Error>> {
  const [subscriptionGroup, subscriptionSecret] = await Promise.all([
    prisma().subscriptionGroup.findUnique({
      where: {
        id: subscriptionGroupId,
      },
      include: {
        channel: true,
        Segment: true,
      },
    }),
    prisma().secret.findUnique({
      where: {
        workspaceId_name: {
          name: SUBSCRIPTION_SECRET_NAME,
          workspaceId,
        },
      },
    }),
  ]);
  if (!subscriptionGroup) {
    return err(new Error("Subscription group not found"));
  }
  const segment = subscriptionGroup.Segment[0];
  if (!segment) {
    return err(new Error("Segment not found"));
  }
  const identifierKey = subscriptionGroup.channel.identifier;
  const userProperties = await prisma().userProperty.findUnique({
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
  });

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
    segmentId: segment.id,
  });
}

export function generateSubscriptionHash({
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
  w,
  i,
  s,
  sub,
}: SubscriptionParams): Promise<Result<string, Error>> {
  const context = await getSubscriptionContext({
    workspaceId: w,
    identifier: i,
    subscriptionGroupId: s,
  });

  if (context.isErr()) {
    return err(context.error);
  }
  const { userId, identifierKey, subscriptionSecret } = context.value;

  const hash = generateSubscriptionHash({
    workspaceId: w,
    userId,
    identifierKey,
    identifier: i,
    subscriptionSecret,
  });

  const params: SubscriptionParams = {
    w,
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
  w,
  h,
  s,
  i,
}: Omit<SubscriptionParams, "sub">): Promise<Result<boolean, Error>> {
  const context = await getSubscriptionContext({
    workspaceId: w,
    identifier: i,
    subscriptionGroupId: s,
  });

  if (context.isErr()) {
    return err(context.error);
  }
  const { userId, identifierKey, subscriptionSecret } = context.value;

  const hash = generateSubscriptionHash({
    workspaceId: w,
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

export async function getUserSubscriptions({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<UserSubscriptionResource[]> {
  const subscriptionGroups = await prisma().subscriptionGroup.findMany({
    where: {
      workspaceId,
    },
    include: {
      Segment: {
        include: {
          SegmentAssignment: {
            where: {
              userId,
            },
          },
        },
      },
    },
  });
  const subscriptions: UserSubscriptionResource[] = [];

  for (const subscriptionGroup of subscriptionGroups) {
    const { Segment, name, id } = subscriptionGroup;
    const inSegment = Segment[0]?.SegmentAssignment[0]?.inSegment === true;

    subscriptions.push({
      id,
      name,
      isSubscribed: inSegment,
    });
  }

  return subscriptions;
}
