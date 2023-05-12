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
  userId: string;
  subscriptionSecret: string;
  segmentId: string;
}

export async function getSubscriptionContext({
  workspaceId,
  subscriptionGroupId,
  identifier,
  identifierKey,
}: {
  workspaceId: string;
  subscriptionGroupId: string;
  identifier: string;
  identifierKey: string;
}): Promise<Result<SubscriptionContext, Error>> {
  const [subscriptionGroup, subscriptionSecret] = await Promise.all([
    prisma().subscriptionGroup.findUnique({
      where: {
        id: subscriptionGroupId,
      },
      include: {
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
  ik,
  s,
  sub,
}: SubscriptionParams): Promise<Result<string, Error>> {
  const [subscriptionSecret, userProperty] = await Promise.all([
    prisma().secret.findUnique({
      where: {
        workspaceId_name: {
          name: SUBSCRIPTION_SECRET_NAME,
          workspaceId: w,
        },
      },
    }),
    prisma().userProperty.findUnique({
      where: {
        workspaceId_name: {
          workspaceId: w,
          name: ik,
        },
      },
      include: {
        UserPropertyAssignment: {
          where: {
            value: i,
          },
        },
      },
    }),
  ]);
  const userId = userProperty?.UserPropertyAssignment[0]?.userId;
  if (!userId) {
    return err(new Error("User not found"));
  }

  if (!subscriptionSecret) {
    return err(new Error("Subscription secret not found"));
  }

  const hash = generateSubscriptionHash({
    workspaceId: w,
    userId,
    identifierKey: ik,
    identifier: i,
    subscriptionSecret: subscriptionSecret.value,
  });

  const params: SubscriptionParams = {
    w,
    i,
    s,
    ik,
    h: hash,
    sub: sub ? "1" : "0",
  };
  const queryString = new URLSearchParams(params).toString();
  const url = `${SUBSCRIPTION_MANAGEMENT_PAGE}?${queryString}`;
  return ok(url);
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
    orderBy: {
      name: "asc",
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
