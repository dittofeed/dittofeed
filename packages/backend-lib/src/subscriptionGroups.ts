import { and, eq, inArray, SQL } from "drizzle-orm";
import {
  SecretNames,
  SUBSCRIPTION_MANAGEMENT_PAGE,
} from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { err, ok, Result } from "neverthrow";
import path from "path";
import { PostgresError } from "pg-error-enum";
import * as R from "remeda";
import { URL } from "url";
import { v4 as uuid, validate as validateUuid } from "uuid";

import config from "./config";
import { generateSecureHash, generateSecureKey } from "./crypto";
import {
  db,
  insert,
  QueryError,
  TxQueryError,
  txQueryResult,
  upsert,
} from "./db";
import {
  secret as dbSecret,
  segment as dbSegment,
  subscriptionGroup as dbSubscriptionGroup,
} from "./db/schema";
import logger from "./logger";
import {
  findAllSegmentAssignments,
  findAllSegmentAssignmentsByIds,
  insertSegmentAssignments,
  SegmentBulkUpsertItem,
} from "./segments";
import {
  EventType,
  GetUserSubscriptionsRequest,
  InternalEventType,
  SavedSubscriptionGroupResource,
  Segment,
  SegmentDefinition,
  SegmentNodeType,
  SubscriptionChange,
  SubscriptionChangeEvent,
  SubscriptionGroup,
  SubscriptionGroupType,
  SubscriptionGroupUpsertValidationError,
  SubscriptionGroupUpsertValidationErrorType,
  SubscriptionParams,
  UpsertSubscriptionGroupResource,
  UserSubscriptionAction,
  UserSubscriptionLookup,
  UserSubscriptionResource,
  UserSubscriptionsUpdate,
} from "./types";
import { InsertUserEvent, insertUserEvents } from "./userEvents";
import { findUserIdsByUserPropertyValue } from "./userProperties";

export type SubscriptionGroupWithAssignment = Pick<
  SubscriptionGroup,
  "name" | "id" | "workspaceId" | "channel" | "type"
> & {
  userId: string;
  segmentId: string;
  value: boolean | null;
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
  if (sg.value !== null) {
    action = sg.value
      ? SubscriptionChange.Subscribe
      : SubscriptionChange.Unsubscribe;
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
  if (!validateUuid(subscriptionGroupId)) {
    return null;
  }
  const sg = await db().query.subscriptionGroup.findFirst({
    where: eq(dbSubscriptionGroup.id, subscriptionGroupId),
    with: {
      segments: true,
    },
  });
  if (!sg?.segments[0]) {
    logger().error(
      {
        workspaceId: sg?.workspaceId,
        subscriptionGroupId,
        userId,
      },
      "No segment found for subscription group",
    );
    return null;
  }
  const segmentId = sg.segments[0].id;
  const assignments = await findAllSegmentAssignmentsByIds({
    workspaceId: sg.workspaceId,
    segmentIds: [segmentId],
    userId,
  });
  const value = assignments[0]?.inSegment ?? null;
  return {
    ...sg,
    userId,
    segmentId,
    value,
  };
}

export function getSubscriptionGroupSegmentName(id: string) {
  return `subscriptionGroup-${id}`;
}

function mapUpsertValidationError(
  error: QueryError | TxQueryError,
): SubscriptionGroupUpsertValidationError {
  if (
    error.code === PostgresError.UNIQUE_VIOLATION ||
    error.code === PostgresError.FOREIGN_KEY_VIOLATION
  ) {
    logger().debug(
      {
        err: error,
      },
      "Unique constraint violation",
    );
    return {
      type: SubscriptionGroupUpsertValidationErrorType.UniqueConstraintViolation,
      message: "Subscription group with this name already exists",
    };
  }
  throw error;
}

// TODO enable a channel type to specified
export async function upsertSubscriptionGroup({
  id,
  name,
  type,
  workspaceId,
  channel,
}: UpsertSubscriptionGroupResource): Promise<
  Result<SubscriptionGroup, SubscriptionGroupUpsertValidationError>
> {
  if (id && !validateUuid(id)) {
    return err({
      type: SubscriptionGroupUpsertValidationErrorType.IdError,
      message: "Invalid subscription group id, must be a valid v4 UUID",
    });
  }

  const txResult: Result<
    SubscriptionGroup,
    SubscriptionGroupUpsertValidationError
  > = await db().transaction(async (tx) => {
    const conditions: SQL[] = [
      eq(dbSubscriptionGroup.workspaceId, workspaceId),
    ];
    if (id) {
      conditions.push(eq(dbSubscriptionGroup.id, id));
    } else if (name) {
      conditions.push(eq(dbSubscriptionGroup.name, name));
    }

    const existingSubscriptionGroup =
      await tx.query.subscriptionGroup.findFirst({
        where: and(...conditions),
      });

    let subscriptionGroup: SubscriptionGroup;
    if (!existingSubscriptionGroup) {
      if (!name) {
        return err({
          type: SubscriptionGroupUpsertValidationErrorType.BadValues,
          message: "Name is required when creating a subscription group",
        });
      }
      const createResult = await txQueryResult(
        tx
          .insert(dbSubscriptionGroup)
          .values({
            id,
            workspaceId,
            name,
            type,
            channel,
          })
          .returning(),
      );
      if (createResult.isErr()) {
        return err(mapUpsertValidationError(createResult.error));
      }
      const createdSubscriptionGroup = createResult.value[0];
      if (!createdSubscriptionGroup) {
        logger().error(
          {
            workspaceId,
            name,
          },
          "subscription group not found after creation",
        );
        throw new Error("subscription group not found after creation");
      }
      subscriptionGroup = createdSubscriptionGroup;
    } else {
      const updateResult = await txQueryResult(
        tx
          .update(dbSubscriptionGroup)
          .set({
            name,
            type,
            channel,
          })
          .where(and(...conditions))
          .returning(),
      );
      if (updateResult.isErr()) {
        return err(mapUpsertValidationError(updateResult.error));
      }
      const updatedSubscriptionGroup = updateResult.value[0];
      if (!updatedSubscriptionGroup) {
        logger().error(
          {
            workspaceId,
            subscriptionGroupId: existingSubscriptionGroup.id,
          },
          "subscription group not found after update",
        );
        throw new Error("subscription group not found after update");
      }
      subscriptionGroup = updatedSubscriptionGroup;
    }

    // Create the associated segment inside the transaction
    const segmentName = getSubscriptionGroupSegmentName(subscriptionGroup.id);
    const segmentDefinition: SegmentDefinition = {
      entryNode: {
        type: SegmentNodeType.SubscriptionGroup,
        id: "1",
        subscriptionGroupId: subscriptionGroup.id,
        subscriptionGroupType: type,
      },
      nodes: [],
    };
    await upsert({
      table: dbSegment,
      values: {
        name: segmentName,
        workspaceId,
        definition: segmentDefinition,
        subscriptionGroupId: subscriptionGroup.id,
        resourceType: "Internal",
      },
      target: [dbSegment.workspaceId, dbSegment.name],
      set: {
        name: segmentName,
        definition: segmentDefinition,
      },
      tx,
    }).then(unwrap);

    return ok(subscriptionGroup);
  });

  if (txResult.isErr()) {
    return err(txResult.error);
  }

  return ok(txResult.value);
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
  isPreview,
}: {
  workspaceId: string;
  userId: string;
  subscriptionSecret: string;
  identifier: string;
  identifierKey: string;
  changedSubscription?: string;
  subscriptionChange?: SubscriptionChange;
  isPreview?: boolean;
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
  if (isPreview) {
    params.isPreview = "true";
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
  const subscriptionGroups = await db().query.subscriptionGroup.findMany({
    where: eq(dbSubscriptionGroup.workspaceId, workspaceId),
    orderBy: (sg, { asc }) => [asc(sg.name)],
    with: {
      segments: true,
    },
  });
  const segmentIds = subscriptionGroups.flatMap((sg) =>
    sg.segments.map((s) => s.id),
  );
  const assignments = await findAllSegmentAssignments({
    workspaceId,
    userId,
    segmentIds,
  });
  const subscriptions: UserSubscriptionResource[] = [];

  for (const subscriptionGroup of subscriptionGroups) {
    const segment = subscriptionGroup.segments[0];
    if (!segment) {
      logger().error(
        { subscriptionGroup },
        "No segment found for subscription group",
      );
      continue;
    }
    const inSegment = assignments[segment.id] === true;

    const { id, name, channel } = subscriptionGroup;

    subscriptions.push({
      id,
      name,
      isSubscribed: inSegment,
      channel,
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
  const [subscriptionSecret, matchingUserIds] = await Promise.all([
    db().query.secret.findFirst({
      where: and(
        eq(dbSecret.workspaceId, workspaceId),
        eq(dbSecret.name, SecretNames.Subscription),
      ),
    }),
    findUserIdsByUserPropertyValue({
      workspaceId,
      userPropertyName: identifierKey,
      value: identifier,
    }),
  ]);

  if (!matchingUserIds || matchingUserIds.length === 0) {
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

  const userId = matchingUserIds.find((uId) => {
    const generatedHash = generateSubscriptionHash({
      workspaceId,
      userId: uId,
      identifierKey,
      identifier,
      subscriptionSecret: secretValue,
    });
    return hash === generatedHash;
  });

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
 * @param param0.userId id of the user to update, or array of user ids to update
 * @param param0.changes changes to apply to the user's subscriptions. Record of
 * subscription group id -> isSubscribed
 * @returns
 */
export async function updateUserSubscriptions({
  workspaceId,
  userUpdates,
}: {
  workspaceId: string;
  userUpdates: {
    userId: string;
    changes: UserSubscriptionsUpdate["changes"];
  }[];
}) {
  const subscriptionGroupIds = userUpdates.flatMap((u) =>
    Object.keys(u.changes),
  );
  const segments = await db().query.segment.findMany({
    where: and(
      eq(dbSegment.workspaceId, workspaceId),
      inArray(dbSegment.subscriptionGroupId, subscriptionGroupIds),
    ),
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

  const allUserEvents = userUpdates.flatMap(({ userId, changes }) => {
    const userChangePairs = R.entries(changes);
    const userEvents = userChangePairs.flatMap(
      ([subscriptionGroupId, isSubscribed]) =>
        buildSubscriptionChangeEvent({
          action: isSubscribed
            ? SubscriptionChange.Subscribe
            : SubscriptionChange.Unsubscribe,
          subscriptionGroupId,
          userId,
        }),
    );
    return userEvents;
  });
  const segmentAssignmentUpdates: SegmentBulkUpsertItem[] = userUpdates.flatMap(
    ({ userId, changes }) => {
      const changePairs = R.entries(changes);
      return changePairs.flatMap(([subscriptionGroupId, isSubscribed]) => {
        const segment = segmentBySubscriptionGroupId[subscriptionGroupId];
        if (!segment) {
          return [];
        }
        return [
          {
            workspaceId,
            userId,
            segmentId: segment.id,
            inSegment: isSubscribed,
          },
        ];
      });
    },
  );

  await Promise.all([
    insertSegmentAssignments(segmentAssignmentUpdates),
    insertUserEvents({
      workspaceId,
      userEvents: allUserEvents,
    }),
  ]);
}

export async function upsertSubscriptionSecret({
  workspaceId,
}: {
  workspaceId: string;
}) {
  return insert({
    table: dbSecret,
    doNothingOnConflict: true,
    lookupExisting: and(
      eq(dbSecret.workspaceId, workspaceId),
      eq(dbSecret.name, SecretNames.Subscription),
    )!,
    values: {
      workspaceId,
      name: SecretNames.Subscription,
      value: generateSecureKey(8),
    },
  }).then(unwrap);
}
