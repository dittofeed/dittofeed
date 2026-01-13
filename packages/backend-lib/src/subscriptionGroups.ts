import csvParser from "csv-parser";
import { and, eq, inArray, SQL } from "drizzle-orm";
import {
  SecretNames,
  SUBSCRIPTION_MANAGEMENT_PAGE,
} from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";
import path from "path";
import { PostgresError } from "pg-error-enum";
import * as R from "remeda";
import { Readable } from "stream";
import { URL } from "url";
import { v4 as uuid, validate as validateUuid } from "uuid";

import { submitBatch } from "./apps/batch";
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
  findAllSegmentAssignmentsByIdsForUsers,
  insertSegmentAssignments,
  SegmentBulkUpsertItem,
} from "./segments";
import {
  BatchItem,
  EventType,
  GetUserSubscriptionsRequest,
  InternalEventType,
  ProcessSubscriptionGroupCsvError,
  ProcessSubscriptionGroupCsvErrorType,
  SavedSubscriptionGroupResource,
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
  UserUploadRow,
  UserUploadRowErrors,
} from "./types";
import {
  findUserIdsByUserProperty,
  InsertUserEvent,
  insertUserEvents,
} from "./userEvents";
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

export async function getSubscriptionGroupsWithAssignments({
  workspaceId,
  subscriptionGroupIds: subscriptionGroupIdsUnsafe,
  userIds,
}: {
  workspaceId: string;
  subscriptionGroupIds?: string[];
  userIds: string[];
}): Promise<SubscriptionGroupWithAssignment[]> {
  const subscriptionGroupIds = subscriptionGroupIdsUnsafe?.filter((id) =>
    validateUuid(id),
  );

  if (userIds.length === 0) {
    return [];
  }
  const subscriptionGroups = await db().query.subscriptionGroup.findMany({
    where: and(
      eq(dbSubscriptionGroup.workspaceId, workspaceId),
      subscriptionGroupIds
        ? inArray(dbSubscriptionGroup.id, subscriptionGroupIds)
        : undefined,
    ),
    with: {
      segments: true,
    },
  });

  const segmentIds = subscriptionGroups.flatMap((sg) =>
    sg.segments.map((s) => s.id),
  );
  // Use the efficient batch version
  const assignmentsByUser = await findAllSegmentAssignmentsByIdsForUsers({
    workspaceId,
    segmentIds,
    userIds,
  });

  return subscriptionGroups.flatMap((sg) => {
    const segmentId = sg.segments[0]?.id;
    if (!segmentId) {
      logger().error(
        {
          workspaceId,
          subscriptionGroupId: sg.id,
          userIds,
        },
        "No segment found for subscription group",
      );
      return [];
    }
    return userIds.map((userId) => {
      const assignments = assignmentsByUser[userId] ?? [];
      const assignment = assignments.find((a) => a.segmentId === segmentId);
      const value = assignment?.inSegment ?? null;
      return {
        ...sg,
        userId,
        segmentId,
        value,
      };
    });
  });
}

export async function getSubscriptionGroupWithAssignment({
  subscriptionGroupId,
  workspaceId,
  userId,
}: {
  subscriptionGroupId: string;
  workspaceId: string;
  userId: string;
}): Promise<SubscriptionGroupWithAssignment | null> {
  const results = await getSubscriptionGroupsWithAssignments({
    workspaceId,
    subscriptionGroupIds: [subscriptionGroupId],
    userIds: [userId],
  });
  return results[0] ?? null;
}

export function getSubscriptionGroupSegmentName(id: string) {
  return `subscriptionGroup-${id}`;
}

export function getSubscriptionGroupUnsubscribedSegmentName(id: string) {
  return `subscriptionGroup-unsubscribed-${id}`;
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
  createdAt,
  updatedAt,
}: UpsertSubscriptionGroupResource & {
  // dates are used for deterministic testing
  createdAt?: Date;
  updatedAt?: Date;
}): Promise<Result<SubscriptionGroup, SubscriptionGroupUpsertValidationError>> {
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
            createdAt,
            updatedAt,
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
            createdAt,
            updatedAt,
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
        createdAt,
        updatedAt,
      },
      target: [dbSegment.workspaceId, dbSegment.name],
      set: {
        name: segmentName,
        definition: segmentDefinition,
        createdAt,
        updatedAt,
      },
      tx,
    }).then(unwrap);

    // Create the unsubscribed segment
    const unsubscribedSegmentName = getSubscriptionGroupUnsubscribedSegmentName(
      subscriptionGroup.id,
    );
    const unsubscribedSegmentDefinition: SegmentDefinition = {
      entryNode: {
        type: SegmentNodeType.SubscriptionGroupUnsubscribed,
        id: "1",
        subscriptionGroupId: subscriptionGroup.id,
      },
      nodes: [],
    };
    await upsert({
      table: dbSegment,
      values: {
        name: unsubscribedSegmentName,
        workspaceId,
        definition: unsubscribedSegmentDefinition,
        subscriptionGroupId: subscriptionGroup.id,
        resourceType: "Internal",
        createdAt,
        updatedAt,
      },
      target: [dbSegment.workspaceId, dbSegment.name],
      set: {
        name: unsubscribedSegmentName,
        definition: unsubscribedSegmentDefinition,
        createdAt,
        updatedAt,
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
  showAllChannels,
}: {
  workspaceId: string;
  userId: string;
  subscriptionSecret: string;
  identifier: string;
  identifierKey: string;
  changedSubscription?: string;
  subscriptionChange?: SubscriptionChange;
  isPreview?: boolean;
  showAllChannels?: boolean;
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
  if (showAllChannels) {
    params.showAllChannels = "true";
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
  const groupWithAssignments = await getSubscriptionGroupsWithAssignments({
    workspaceId,
    userIds: [userId],
  });
  return groupWithAssignments.map((sg) => {
    const details = getSubscriptionGroupDetails(sg);
    const isSubscribed = inSubscriptionGroup(details);

    return {
      name: sg.name,
      id: sg.id,
      channel: sg.channel,
      isSubscribed,
    };
  });
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

  // Store both main and unsubscribed segments per subscription group
  interface SegmentPair {
    mainSegmentId?: string;
    unsubscribedSegmentId?: string;
  }

  const segmentsBySubscriptionGroupId = segments.reduce<
    Record<string, SegmentPair>
  >((acc, segment) => {
    if (!segment.subscriptionGroupId) {
      return acc;
    }

    const existingPair = acc[segment.subscriptionGroupId] ?? {};
    const mainSegmentName = getSubscriptionGroupSegmentName(
      segment.subscriptionGroupId,
    );
    const unsubscribedSegmentName = getSubscriptionGroupUnsubscribedSegmentName(
      segment.subscriptionGroupId,
    );

    if (segment.name === mainSegmentName) {
      return {
        ...acc,
        [segment.subscriptionGroupId]: {
          ...existingPair,
          mainSegmentId: segment.id,
        },
      };
    }
    if (segment.name === unsubscribedSegmentName) {
      return {
        ...acc,
        [segment.subscriptionGroupId]: {
          ...existingPair,
          unsubscribedSegmentId: segment.id,
        },
      };
    }
    return acc;
  }, {});

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
        const segmentPair = segmentsBySubscriptionGroupId[subscriptionGroupId];
        if (!segmentPair) {
          return [];
        }

        const assignments: SegmentBulkUpsertItem[] = [];

        // Main segment: inSegment = isSubscribed
        if (segmentPair.mainSegmentId) {
          assignments.push({
            workspaceId,
            userId,
            segmentId: segmentPair.mainSegmentId,
            inSegment: isSubscribed,
          });
        }

        // Unsubscribed segment: inSegment = !isSubscribed
        if (segmentPair.unsubscribedSegmentId) {
          assignments.push({
            workspaceId,
            userId,
            segmentId: segmentPair.unsubscribedSegmentId,
            inSegment: !isSubscribed,
          });
        }

        return assignments;
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

export type SubscriptionGroupCsvParseResult = Result<
  UserUploadRow[],
  ProcessSubscriptionGroupCsvError
>;

export async function parseSubscriptionGroupCsv(
  csvStream: Readable,
): Promise<SubscriptionGroupCsvParseResult> {
  return new Promise<SubscriptionGroupCsvParseResult>((resolve) => {
    const parsingErrors: UserUploadRowErrors[] = [];
    const uploadedRows: UserUploadRow[] = [];

    let i = 0;
    csvStream
      .pipe(csvParser())
      .on("headers", (headers: string[]) => {
        if (!headers.includes("id") && !headers.includes("email")) {
          resolve(
            err({
              type: ProcessSubscriptionGroupCsvErrorType.MissingHeaders,
              message: 'csv must have "id" or "email" headers',
            }),
          );
          csvStream.destroy();
        }
      })
      .on("data", (row: unknown) => {
        if (row instanceof Object && Object.keys(row).length === 0) {
          return;
        }
        const parsed = schemaValidate(row, UserUploadRow);
        const rowNumber = i;
        i += 1;

        if (parsed.isErr()) {
          const errors = {
            row: rowNumber,
            error: 'row must have a non-empty "email" or "id" field',
          };
          parsingErrors.push(errors);
          return;
        }

        const { value } = parsed;
        if ((value.email?.length ?? 0) === 0 && (value.id?.length ?? 0) === 0) {
          const errors = {
            row: rowNumber,
            error: 'row must have a non-empty "email" or "id" field',
          };
          parsingErrors.push(errors);
          return;
        }

        uploadedRows.push(parsed.value);
      })
      .on("end", () => {
        logger().debug(`Parsed ${uploadedRows.length} rows`);
        if (parsingErrors.length) {
          resolve(
            err({
              type: ProcessSubscriptionGroupCsvErrorType.RowValidationErrors,
              message: "csv rows contained errors",
              rowErrors: parsingErrors,
            }),
          );
        } else {
          resolve(ok(uploadedRows));
        }
      })
      .on("error", (error) => {
        resolve(
          err({
            type: ProcessSubscriptionGroupCsvErrorType.ParseError,
            message: `misformatted file: ${error.message}`,
          }),
        );
      });
  });
}

export interface ProcessSubscriptionGroupCsvRequest {
  csvStream: Readable;
  workspaceId: string;
  subscriptionGroupId: string;
}

export async function processSubscriptionGroupCsv({
  csvStream,
  workspaceId,
  subscriptionGroupId,
}: ProcessSubscriptionGroupCsvRequest): Promise<
  Result<void, ProcessSubscriptionGroupCsvError>
> {
  const rows = await parseSubscriptionGroupCsv(csvStream);
  if (rows.isErr()) {
    return err(rows.error);
  }

  const emailsWithoutIds: Set<string> = new Set<string>();

  for (const row of rows.value) {
    if (row.email && !row.id) {
      emailsWithoutIds.add(row.email);
    }
  }

  const missingUserIdsByEmail = await findUserIdsByUserProperty({
    userPropertyName: "email",
    workspaceId,
    valueSet: emailsWithoutIds,
  });

  const batch: BatchItem[] = [];
  const currentTime = new Date();
  const timestamp = currentTime.toISOString();

  for (const row of rows.value) {
    const userIds = missingUserIdsByEmail[row.email];
    const userId =
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      (row.id as string | undefined) ?? (userIds?.length ? userIds[0] : uuid());

    if (!userId) {
      continue;
    }

    // Handle action column
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const actionValue = (row as Record<string, string>).action;
    let subscriptionAction = SubscriptionChange.Subscribe; // default to subscribe

    if (actionValue !== undefined && actionValue !== "") {
      if (actionValue === "subscribe") {
        subscriptionAction = SubscriptionChange.Subscribe;
      } else if (actionValue === "unsubscribe") {
        subscriptionAction = SubscriptionChange.Unsubscribe;
      } else {
        return err({
          type: ProcessSubscriptionGroupCsvErrorType.InvalidActionValue,
          message: `Invalid action value: "${actionValue}". Must be "subscribe" or "unsubscribe".`,
          actionValue,
        });
      }
    }

    const identifyEvent: BatchItem = {
      type: EventType.Identify,
      userId,
      messageId: uuid(),
      timestamp,
      traits: R.omit(row, ["id", "action"]),
    };

    const trackEvent: BatchItem = {
      type: EventType.Track,
      userId,
      messageId: uuid(),
      timestamp,
      event: InternalEventType.SubscriptionChange,
      properties: {
        subscriptionId: subscriptionGroupId,
        action: subscriptionAction,
      },
    };

    batch.push(trackEvent);
    batch.push(identifyEvent);
  }

  await submitBatch({
    workspaceId,
    data: { batch },
  });

  return ok(undefined);
}
