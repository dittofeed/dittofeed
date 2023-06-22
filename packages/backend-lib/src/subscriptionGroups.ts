import {
  Prisma,
  Segment,
  SegmentAssignment,
  SubscriptionGroup,
} from "@prisma/client";
import {
  SUBSCRIPTION_MANAGEMENT_PAGE,
  SUBSCRIPTION_SECRET_NAME,
} from "isomorphic-lib/src/constants";
import { err, ok, Result } from "neverthrow";
import path from "path";
import * as R from "remeda";
import { URL } from "url";
import { v4 as uuid } from "uuid";

import config from "./config";
import { generateSecureHash } from "./crypto";
import logger from "./logger";
import prisma from "./prisma";
import {
  ChannelType,
  InternalEventType,
  JSONValue,
  SegmentDefinition,
  SegmentNodeType,
  SubscriptionChange,
  SubscriptionGroupResource,
  SubscriptionGroupType,
  SubscriptionParams,
  UpsertSubscriptionGroupResource,
  UserSubscriptionLookup,
  UserSubscriptionResource,
  UserSubscriptionsUpdate,
} from "./types";
import { InsertUserEvent, insertUserEvents } from "./userEvents";

export async function getSubscriptionGroupWithAssignment({
  subscriptionGroupId,
  userId,
}: {
  subscriptionGroupId: string;
  userId: string;
}): Promise<
  | (SubscriptionGroup & {
      Segment: (Segment & {
        SegmentAssignment: SegmentAssignment[];
      })[];
    })
  | null
> {
  const sg = await prisma().subscriptionGroup.findUnique({
    where: {
      id: subscriptionGroupId,
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
  return sg;
}

// TODO enable a channel type to specified
export async function upsertSubscriptionGroup({
  id,
  name,
  type,
  workspaceId,
}: UpsertSubscriptionGroupResource): Promise<Result<SubscriptionGroup, Error>> {
  const sg = await prisma().$transaction(async (tx) => {
    const where: Prisma.SubscriptionGroupUpsertArgs["where"] = id
      ? {
          id,
        }
      : {
          workspaceId_name: {
            workspaceId,
            name,
          },
        };

    const subscriptionGroup = await tx.subscriptionGroup.upsert({
      where,
      create: {
        name,
        type,
        channel: ChannelType.Email,
        workspaceId,
        id,
      },
      update: {
        name,
        type,
      },
    });

    const segmentName = `subscriptionGroup-${id}`;
    const segmentDefinition: SegmentDefinition = {
      entryNode: {
        type: SegmentNodeType.SubscriptionGroup,
        id: "1",
        subscriptionGroupId: subscriptionGroup.id,
        subscriptionGroupType: type,
      },
      nodes: [],
    };

    await tx.segment.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: segmentName,
        },
      },
      create: {
        name: segmentName,
        workspaceId,
        definition: segmentDefinition,
        subscriptionGroupId: subscriptionGroup.id,
        resourceType: "Internal",
      },
      update: {
        name: segmentName,
        definition: segmentDefinition,
      },
    });
    return subscriptionGroup;
  });

  return ok(sg);
}

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

export function generateSubscriptionChangeUrl({
  workspaceId,
  subscriptionSecret,
  userId,
  identifier,
  identifierKey,
  changedSubscription,
  subscriptionChange,
}: {
  workspaceId: string;
  userId: string;
  subscriptionSecret: string;
  identifier: string;
  identifierKey: string;
  changedSubscription?: string;
  subscriptionChange?: SubscriptionChange;
}): string {
  const hash = generateSubscriptionHash({
    workspaceId,
    userId,
    identifierKey,
    identifier,
    subscriptionSecret,
  });

  const params: SubscriptionParams = {
    w: workspaceId,
    i: identifier,
    ik: identifierKey,
    h: hash,
  };
  if (changedSubscription) {
    params.s = changedSubscription;
    params.sub =
      subscriptionChange === SubscriptionChange.Subscribe ? "1" : "0";
  }
  const url = new URL(config().dashboardUrl);
  url.pathname = path.join("/dashboard", SUBSCRIPTION_MANAGEMENT_PAGE);
  url.search = new URLSearchParams(params).toString();
  logger().debug(
    {
      url: url.toString(),
    },
    "generated subscription change url"
  );
  return url.toString();
}

export function buildSubscriptionChangeEventInner({
  messageId,
  userId,
  action,
  subscriptionGroupId,
  timestamp,
}: {
  userId: string;
  messageId: string;
  subscriptionGroupId: string;
  timestamp: string;
  action: SubscriptionChange;
}): Record<string, JSONValue> {
  return {
    userId,
    timestamp,
    messageId,
    type: "track",
    event: InternalEventType.SubscriptionChange,
    properties: {
      subscriptionId: subscriptionGroupId,
      action,
    },
  };
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
    messageRaw: JSON.stringify(
      buildSubscriptionChangeEventInner({
        userId,
        action,
        subscriptionGroupId,
        timestamp,
        messageId,
      })
    ),
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
    const segment = subscriptionGroup.Segment[0];
    if (!segment) {
      logger().error(
        { subscriptionGroup },
        "No segment found for subscription group"
      );
      continue;
    }
    const inSegment = segment.SegmentAssignment[0]?.inSegment === true;

    const { id, name } = subscriptionGroup;

    subscriptions.push({
      id,
      name,
      isSubscribed: inSegment,
    });
  }

  return subscriptions;
}

/**
 * Lookup a user for subscriptions by identifier and identifier key (email, phone, etc)
 * If the user is found, return the userId. When the hash is invalid, return an error.
 * @param param0
 * @returns
 */
export async function lookupUserForSubscriptions({
  workspaceId,
  identifier,
  identifierKey,
  hash,
}: UserSubscriptionLookup): Promise<Result<{ userId: string }, Error>> {
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
            value: JSON.stringify(identifier),
          },
        },
      },
    }),
  ]);

  const userPropertyAssignment = userProperties?.UserPropertyAssignment[0];
  if (!userPropertyAssignment) {
    return err(new Error("User not found"));
  }

  // This is a programmatic error, should never happen
  if (!subscriptionSecret) {
    throw new Error("Subscription secret not found");
  }

  const { userId } = userPropertyAssignment;

  const expectedHash = generateSubscriptionHash({
    workspaceId,
    userId,
    identifierKey,
    identifier,
    subscriptionSecret: subscriptionSecret.value,
  });

  if (expectedHash !== hash) {
    return err(new Error("Hash mismatch"));
  }
  return ok({ userId });
}

/**
 *
 * @param param0.userId id of the user to update
 * @param param0.changes changes to apply to the user's subscriptions. Record of
 * subscription group id -> isSubscribed
 * @returns
 */
export async function updateUserSubscriptions({
  workspaceId,
  userId,
  changes,
}: {
  workspaceId: string;
  userId: string;
  changes: UserSubscriptionsUpdate["changes"];
}) {
  const segments = await prisma().segment.findMany({
    where: {
      workspaceId,
      subscriptionGroupId: {
        in: Object.keys(changes),
      },
    },
  });

  const segmentBySubscriptionGroupId = segments.reduce<Record<string, Segment>>(
    (acc, segment) => {
      if (!segment.subscriptionGroupId) {
        return acc;
      }
      return {
        ...acc,
        [segment.subscriptionGroupId]: segment,
      };
    },
    {}
  );

  const changePairs = R.toPairs(changes);
  const userEvents = changePairs.flatMap(
    ([subscriptionGroupId, isSubscribed]) =>
      buildSubscriptionChangeEvent({
        action: isSubscribed
          ? SubscriptionChange.Subscribe
          : SubscriptionChange.Unsubscribe,
        subscriptionGroupId,
        userId,
      })
  );

  const segmentAssignmentUpdates = changePairs.flatMap(
    ([subscriptionGroupId, isSubscribed]) => {
      const segment = segmentBySubscriptionGroupId[subscriptionGroupId];
      if (!segment) {
        logger().error(
          {
            segmentBySubscriptionGroupId,
            subscriptionGroupId,
            segments,
            changes,
            changesKeys: Object.keys(changes),
          },
          "Segment not found for subscription group id"
        );
        return [];
      }
      return prisma().segmentAssignment.upsert({
        where: {
          workspaceId_userId_segmentId: {
            workspaceId,
            userId,
            segmentId: segment.id,
          },
        },
        create: {
          workspaceId,
          userId,
          segmentId: segment.id,
          inSegment: isSubscribed,
        },
        update: {
          inSegment: isSubscribed,
        },
      });
    }
  );

  await Promise.all([
    ...segmentAssignmentUpdates,
    insertUserEvents({
      workspaceId,
      userEvents,
    }),
  ]);
}
