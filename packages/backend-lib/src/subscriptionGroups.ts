import { Segment, SegmentAssignment, SubscriptionGroup } from "@prisma/client";
import {
  SecretNames,
  SUBSCRIPTION_MANAGEMENT_PAGE,
} from "isomorphic-lib/src/constants";
import { err, ok, Result } from "neverthrow";
import path from "path";
import * as R from "remeda";
import { URL } from "url";
import { v4 as uuid } from "uuid";

import config from "./config";
import { generateSecureHash, generateSecureKey } from "./crypto";
import logger from "./logger";
import prisma from "./prisma";
import {
  EventType,
  GetUserSubscriptionsRequest,
  InternalEventType,
  SavedSubscriptionGroupResource,
  SegmentDefinition,
  SegmentNodeType,
  SubscriptionChange,
  SubscriptionChangeEvent,
  SubscriptionGroupType,
  SubscriptionParams,
  UpsertSubscriptionGroupResource,
  UserSubscriptionAction,
  UserSubscriptionLookup,
  UserSubscriptionResource,
  UserSubscriptionsUpdate,
} from "./types";
import { InsertUserEvent, insertUserEvents } from "./userEvents";

export type SubscriptionGroupWithAssignment = SubscriptionGroup & {
  Segment: (Segment & {
    SegmentAssignment: SegmentAssignment[];
  })[];
};

export interface SubscriptionGroupDetails {
  id: string;
  action: UserSubscriptionAction;
  type: SubscriptionGroupType;
}

export function inSubscriptionGroup(
  details: SubscriptionGroupDetails,
): boolean {
  // in the case that the subscription group segment hasn't been calculated yet
  if (details.action === null && details.type === SubscriptionGroupType.OptIn) {
    return false;
  }
  return details.action !== SubscriptionChange.Unsubscribe;
}

export function getSubscriptionGroupDetails(
  sg: SubscriptionGroupWithAssignment,
): SubscriptionGroupDetails {
  let action: UserSubscriptionAction;
  if (sg.Segment[0]?.SegmentAssignment[0] !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    action = sg.Segment[0].SegmentAssignment[0].inSegment
      ? UserSubscriptionAction.Subscribe
      : UserSubscriptionAction.Unsubscribe;
  } else {
    action = null;
  }
  return {
    type:
      sg.type === "OptIn"
        ? SubscriptionGroupType.OptIn
        : SubscriptionGroupType.OptOut,
    action,
    id: sg.id,
  };
}

export async function getSubscriptionGroupWithAssignment({
  subscriptionGroupId,
  userId,
}: {
  subscriptionGroupId: string;
  userId: string;
}): Promise<SubscriptionGroupWithAssignment | null> {
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
  channel,
}: UpsertSubscriptionGroupResource): Promise<Result<SubscriptionGroup, Error>> {
  const sg = await prisma().$transaction(async (tx) => {
    const subscriptionGroup = await tx.subscriptionGroup.upsert({
      where: {
        id,
      },
      create: {
        name,
        type,
        channel,
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
  subscriptionGroup: SubscriptionGroup,
): SavedSubscriptionGroupResource {
  const type: SubscriptionGroupType =
    subscriptionGroup.type === "OptIn"
      ? SubscriptionGroupType.OptIn
      : SubscriptionGroupType.OptOut;

  return {
    id: subscriptionGroup.id,
    workspaceId: subscriptionGroup.workspaceId,
    name: subscriptionGroup.name,
    channel: subscriptionGroup.channel,
    type,
    createdAt: subscriptionGroup.createdAt.getTime(),
    updatedAt: subscriptionGroup.updatedAt.getTime(),
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
  const urlString = url.toString();
  logger().debug(
    {
      urlString,
    },
    "generated subscription change url",
  );
  return urlString;
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
}): {
  userId: string;
  timestamp: string;
  messageId: string;
} & SubscriptionChangeEvent {
  return {
    userId,
    timestamp,
    messageId,
    type: EventType.Track,
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
      }),
    ),
  };
}

export async function getUserSubscriptions({
  workspaceId,
  userId,
}: GetUserSubscriptionsRequest): Promise<UserSubscriptionResource[]> {
  const subscriptionGroups = await prisma().subscriptionGroup.findMany({
    where: {
      workspaceId,
    },
    orderBy: {
      name: "asc",
    },
    include: {
      Segment: {
        where: {
          workspaceId,
        },
        include: {
          SegmentAssignment: {
            where: {
              userId,
              workspaceId,
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
        "No segment found for subscription group",
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
          name: SecretNames.Subscription,
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
            workspaceId,
            value: identifier,
          },
        },
      },
    }),
  ]);

  const assignments = userProperties?.UserPropertyAssignment;
  if (!assignments || assignments.length === 0) {
    logger().warn(
      {
        identifier,
        identifierKey,
      },
      "User not found",
    );
    return err(new Error("User not found"));
  }

  const secretValue = subscriptionSecret?.value;

  // This is a programmatic error, should never happen
  if (!secretValue) {
    throw new Error("Subscription secret not found");
  }

  const userId = assignments.find(({ userId: assignmentUserId }) => {
    const generatedHash = generateSubscriptionHash({
      workspaceId,
      userId: assignmentUserId,
      identifierKey,
      identifier,
      subscriptionSecret: secretValue,
    });
    return hash === generatedHash;
  })?.userId;

  if (!userId) {
    logger().warn(
      {
        workspaceId,
        identifier,
        identifierKey,
        hash,
      },
      "Invalid hash",
    );
    return err(new Error("Invalid hash"));
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
    {},
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
      }),
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
          "Segment not found for subscription group id",
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
    },
  );

  await Promise.all([
    ...segmentAssignmentUpdates,
    insertUserEvents({
      workspaceId,
      userEvents,
    }),
  ]);
}

export async function upsertSubscriptionSecret({
  workspaceId,
}: {
  workspaceId: string;
}) {
  return prisma().secret.upsert({
    where: {
      workspaceId_name: {
        workspaceId,
        name: SecretNames.Subscription,
      },
    },
    create: {
      workspaceId,
      name: SecretNames.Subscription,
      value: generateSecureKey(8),
    },
    update: {},
  });
}
