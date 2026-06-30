/* eslint-disable no-await-in-loop */
import {
  ClickHouseQueryBuilder,
  command,
  query,
} from "backend-lib/src/clickhouse";
import {
  resetGlobalCron,
  startComputePropertiesWorkflow,
  startComputePropertiesWorkflowGlobal,
  stopComputePropertiesWorkflowGlobal,
  terminateComputePropertiesWorkflow,
  terminateWorkspaceRecomputeWorkflows,
} from "backend-lib/src/computedProperties/computePropertiesWorkflow/lifecycle";
import { db, insert } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import logger from "backend-lib/src/logger";
import { publicDrizzleMigrate } from "backend-lib/src/migrate";
import { getSubscriptionGroupUnsubscribedSegmentName } from "backend-lib/src/subscriptionGroups";
import {
  EmailProviderSecret,
  EmailProviderType,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  Workspace,
} from "backend-lib/src/types";
import {
  buildIdentifyEventsTableQuery,
  buildInternalEventsTableQuery,
  buildTrackEventsTableQuery,
  buildUserTraitValuesBackfillInsertQuery,
  buildUserTraitValuesMaterializedViewQuery,
  buildUserTraitValuesTableQuery,
  COMPUTED_PROPERTY_ASSIGNMENTS_CURRENT_TABLE,
  COMPUTED_PROPERTY_ASSIGNMENTS_TABLE,
  CREATE_COMPUTED_PROPERTY_STATE_V3_TABLE_QUERY,
  CREATE_IDENTIFY_EVENTS_MATERIALIZED_VIEW_QUERY,
  CREATE_INTERNAL_EVENTS_TABLE_MATERIALIZED_VIEW_QUERY,
  CREATE_LEGACY_USER_TRAIT_VALUES_CURRENT_VIEW_QUERY,
  CREATE_TRACK_EVENTS_MATERIALIZED_VIEW_QUERY,
  CREATE_UPDATED_COMPUTED_PROPERTY_STATE_V3_MV_QUERY,
  CREATE_USER_PROPERTY_IDX_DATE_MV_QUERY,
  CREATE_USER_PROPERTY_IDX_DATE_QUERY,
  CREATE_USER_PROPERTY_IDX_NUM_MV_QUERY,
  CREATE_USER_PROPERTY_IDX_NUM_QUERY,
  CREATE_USER_PROPERTY_IDX_STR_MV_QUERY,
  CREATE_USER_PROPERTY_IDX_STR_QUERY,
  CREATE_USER_PROPERTY_INDEX_CONFIG_QUERY,
  CREATE_USER_TRAIT_VALUES_MATERIALIZED_VIEW_QUERY,
  CREATE_V3_USER_TRAIT_VALUES_CURRENT_VIEW_QUERY,
  createUserEventsTables,
  GROUP_MATERIALIZED_VIEWS,
  GROUP_TABLES,
  IDENTIFY_EVENTS_TABLE,
  TRACK_EVENTS_TABLE,
  USER_TRAIT_VALUES_CURRENT_VIEW,
  USER_TRAIT_VALUES_TABLE,
  USER_TRAIT_VALUES_V3_TABLE,
} from "backend-lib/src/userEvents/clickhouse";
import {
  migrateMergeTreeToReplicatedMergeTree,
  resolveMergeTreeEngine,
} from "backend-lib/src/userEvents/clickhouseEngines";
import { and, eq, inArray, sql } from "drizzle-orm";
import { SecretNames } from "isomorphic-lib/src/constants";
import { parseInt } from "isomorphic-lib/src/numbers";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

import { spawnWithEnv, spawnWithEnvSafe } from "./spawn";

export async function addJourneyTypeColumn() {
  logger().info("Adding journeyType column to Journey table.");
  await db().execute(sql`
    ALTER TABLE "Journey"
    ADD COLUMN IF NOT EXISTS "journeyType" text DEFAULT 'Marketing' NOT NULL
  `);
  logger().info("Finished adding journeyType column to Journey table.");
}

export async function createUserSortingIndexTables() {
  logger().info("Creating user sorting index tables and materialized views.");
  const queries = [
    CREATE_USER_PROPERTY_INDEX_CONFIG_QUERY,
    CREATE_USER_PROPERTY_IDX_NUM_QUERY,
    CREATE_USER_PROPERTY_IDX_STR_QUERY,
    CREATE_USER_PROPERTY_IDX_DATE_QUERY,
    CREATE_USER_PROPERTY_IDX_NUM_MV_QUERY,
    CREATE_USER_PROPERTY_IDX_STR_MV_QUERY,
    CREATE_USER_PROPERTY_IDX_DATE_MV_QUERY,
  ];

  for (const q of queries) {
    await command({
      query: q,
      clickhouse_settings: {
        wait_end_of_query: 1,
      },
    });
  }
  logger().info("Finished creating user sorting index tables and views.");
}

export async function backfillComputedPropertyAssignmentsCurrent({
  workspaceId,
  resetCurrent,
}: {
  workspaceId?: string;
  resetCurrent: boolean;
}) {
  logger().info(
    { workspaceId, resetCurrent },
    "Backfilling current computed property assignments table.",
  );
  await createUserEventsTables();

  const qb = new ClickHouseQueryBuilder();
  const workspaceClause = workspaceId
    ? `WHERE workspace_id = ${qb.addQueryValue(workspaceId, "String")}`
    : "";
  const deleteWorkspaceClause = workspaceId
    ? workspaceClause
    : "WHERE 1 = 1";

  if (resetCurrent) {
    await command({
      query: `
        DELETE FROM ${COMPUTED_PROPERTY_ASSIGNMENTS_CURRENT_TABLE}
        ${deleteWorkspaceClause}
        SETTINGS mutations_sync = 1, lightweight_deletes_sync = 1
      `,
      query_params: qb.getQueries(),
      clickhouse_settings: {
        wait_end_of_query: 1,
      },
    });
  }

  const segmentRows = workspaceId
    ? await db()
        .select({
          id: schema.segment.id,
          workspaceId: schema.segment.workspaceId,
        })
        .from(schema.segment)
        .where(eq(schema.segment.workspaceId, workspaceId))
    : await db()
        .select({
          id: schema.segment.id,
          workspaceId: schema.segment.workspaceId,
        })
        .from(schema.segment);
  const userPropertyRows = workspaceId
    ? await db()
        .select({
          id: schema.userProperty.id,
          workspaceId: schema.userProperty.workspaceId,
        })
        .from(schema.userProperty)
        .where(eq(schema.userProperty.workspaceId, workspaceId))
    : await db()
        .select({
          id: schema.userProperty.id,
          workspaceId: schema.userProperty.workspaceId,
        })
        .from(schema.userProperty);

  const items = [
    ...segmentRows.map((row) => ({
      ...row,
      type: "segment" as const,
    })),
    ...userPropertyRows.map((row) => ({
      ...row,
      type: "user_property" as const,
    })),
  ];

  logger().info(
    { workspaceId, itemCount: items.length },
    "Backfilling current computed property assignments in chunks.",
  );

  let completed = 0;
  for (const item of items) {
    await command({
      query: `
        INSERT INTO ${COMPUTED_PROPERTY_ASSIGNMENTS_CURRENT_TABLE}
        SELECT
          workspace_id,
          type,
          computed_property_id,
          user_id,
          argMax(segment_value, assigned_at) AS segment_value,
          argMax(user_property_value, assigned_at) AS user_property_value,
          argMax(max_event_time, assigned_at) AS max_event_time,
          max(assigned_at) AS latest_assigned_at
        FROM ${COMPUTED_PROPERTY_ASSIGNMENTS_TABLE}
        WHERE
          workspace_id = {workspaceId:String}
          AND type = {type:String}
          AND computed_property_id = {computedPropertyId:String}
        GROUP BY
          workspace_id,
          type,
          computed_property_id,
          user_id
      `,
      query_params: {
        workspaceId: item.workspaceId,
        type: item.type,
        computedPropertyId: item.id,
      },
      clickhouse_settings: {
        wait_end_of_query: 1,
        max_execution_time: 0,
        max_bytes_before_external_group_by: "1000000000",
        max_bytes_before_external_sort: "1000000000",
      },
    });
    completed += 1;
    logger().info(
      {
        workspaceId: item.workspaceId,
        type: item.type,
        computedPropertyId: item.id,
        completed,
        total: items.length,
      },
      "Backfilled current computed property assignment chunk.",
    );
  }

  logger().info(
    { workspaceId },
    "Finished backfilling current computed property assignments table.",
  );
}

export async function disentangleResendSendgrid() {
  logger().info("Disentangling resend and sendgrid email providers.");
  await db().transaction(async (pTx) => {
    const emailProviders = await pTx.query.emailProvider.findMany({
      where: inArray(schema.emailProvider.type, [
        EmailProviderType.SendGrid,
        EmailProviderType.Resend,
      ]),
      with: {
        secret: true,
      },
    });
    const misnamedValues = emailProviders.flatMap((ep) => {
      if (!ep.secret?.configValue) {
        logger().error(
          {
            emailProvider: ep,
          },
          "email provider has no secret",
        );
        return [];
      }
      const secret = schemaValidateWithErr(
        ep.secret.configValue,
        EmailProviderSecret,
      );
      if (secret.isErr()) {
        logger().error(
          {
            err: secret.error,
            emailProviderId: ep.id,
          },
          "failed to validate secret",
        );
        return [];
      }
      const secretValue = secret.value;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      if (ep.type === secretValue.type) {
        return [];
      }
      return {
        workspaceId: ep.workspaceId,
        emailProviderId: ep.id,
        emailProviderType: ep.type,
        secretId: ep.secret.id,
        secretName: ep.secret.name,
        secretValue,
      };
    });
    const promises: Promise<unknown>[] = [];
    for (const misnamed of misnamedValues) {
      logger().info(
        {
          workspaceId: misnamed.workspaceId,
          emailProviderId: misnamed.emailProviderId,
          emailProviderType: misnamed.emailProviderType,
          secretId: misnamed.secretId,
          secretName: misnamed.secretName,
          secretValueType: misnamed.secretValue.type,
        },
        "Misnamed.",
      );
      if (
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        misnamed.emailProviderType === EmailProviderType.Resend &&
        misnamed.secretValue.type === EmailProviderType.SendGrid
      ) {
        logger().info("Correcting Resend email provider.");
        promises.push(
          (async () => {
            const secret = await insert({
              table: schema.secret,
              doNothingOnConflict: true,
              lookupExisting: and(
                eq(schema.secret.workspaceId, misnamed.workspaceId),
                eq(schema.secret.name, SecretNames.Resend),
              )!,
              values: {
                name: SecretNames.Resend,
                workspaceId: misnamed.workspaceId,
                configValue: { type: EmailProviderType.Resend },
              },
              tx: pTx,
            }).then(unwrap);

            await pTx
              .update(schema.emailProvider)
              .set({
                secretId: secret.id,
              })
              .where(eq(schema.emailProvider.id, misnamed.emailProviderId));
          })(),
        );
      } else if (
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        misnamed.emailProviderType === EmailProviderType.SendGrid &&
        misnamed.secretValue.type === EmailProviderType.Resend
      ) {
        logger().info("Correcting Sendgrid email provider.");
        promises.push(
          (async () => {
            const secret = await insert({
              table: schema.secret,
              doNothingOnConflict: true,
              lookupExisting: and(
                eq(schema.secret.workspaceId, misnamed.workspaceId),
                eq(schema.secret.name, SecretNames.Resend),
              )!,
              values: {
                name: SecretNames.Resend,
                workspaceId: misnamed.workspaceId,
                configValue: misnamed.secretValue,
              },
            }).then(unwrap);

            await pTx
              .update(schema.emailProvider)
              .set({
                secretId: secret.id,
              })
              .where(eq(schema.emailProvider.id, misnamed.emailProviderId));

            await pTx
              .update(schema.secret)
              .set({
                configValue: { type: EmailProviderType.SendGrid },
              })
              .where(eq(schema.secret.id, secret.id));
          })(),
        );
      }
    }
    await Promise.all(promises);
  });
  logger().info("Done.");
}

async function upgradeWorkspaceV010Pre(workspace: Workspace) {
  logger().info(
    {
      workspaceName: workspace.name,
    },
    "Performing pre-upgrade steps for workspace",
  );
  await terminateComputePropertiesWorkflow({ workspaceId: workspace.id });
}

export async function upgradeV010Pre() {
  logger().info("Performing pre-upgrade steps for v0.10.0");

  // run sql migrations
  await spawnWithEnv([
    "yarn",
    "workspace",
    "backend-lib",
    "prisma",
    "migrate",
    "deploy",
  ]);

  // create new clickhouse tables and views
  await createUserEventsTables();

  const workspaces = await db().select().from(schema.workspace);
  await Promise.all(workspaces.map(upgradeWorkspaceV010Pre));
  logger().info("Pre-upgrade steps for v0.10.0 completed.");
}

async function upgradeWorkspaceV010Post(workspace: Workspace) {
  logger().info(
    {
      workspaceName: workspace.name,
    },
    "Performing post-upgrade steps for workspace",
  );
  await startComputePropertiesWorkflow({ workspaceId: workspace.id });
}

export async function upgradeV010Post() {
  logger().info("Performing post-upgrade steps for v0.10.0");
  await db().delete(schema.computedPropertyPeriod);
  const workspaces = await db().select().from(schema.workspace);
  await Promise.all(workspaces.map(upgradeWorkspaceV010Post));
  await command({
    query: "drop view if exists updated_computed_property_state_mv;",
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  logger().info("Performing post-upgrade steps for v0.10.0 completed.");
}

export async function upgradeV012Pre() {
  logger().info("Performing pre-upgrade steps for v0.12.0");

  await disentangleResendSendgrid();

  await spawnWithEnvSafe([
    "yarn",
    "workspace",
    "backend-lib",
    "prisma",
    "migrate",
    "deploy",
  ]);
  logger().info("Pre-upgrade steps for v0.12.0 completed.");
}

async function createGroupTables() {
  const tableQueries = GROUP_TABLES.map((q) =>
    command({
      query: q,
      clickhouse_settings: { wait_end_of_query: 1 },
    }),
  );
  await Promise.all(tableQueries);

  const mvQueries = GROUP_MATERIALIZED_VIEWS.map((q) =>
    command({
      query: q,
      clickhouse_settings: { wait_end_of_query: 1 },
    }),
  );
  await Promise.all(mvQueries);
}

export async function upgradeV021Pre() {
  logger().info("Performing pre-upgrade steps for v0.21.0");
  logger().info("Running postgres migrations");
  await publicDrizzleMigrate();
  logger().info("Creating group clickhouse tables");
  await createGroupTables();

  logger().info("Pre-upgrade steps for v0.21.0 completed.");
}

export async function refreshNotExistsSegmentDefinitionUpdatedAt() {
  logger().info(
    "Refreshing definitionUpdatedAt for segments with NotExists trait nodes",
  );

  const now = new Date();
  const batchSize = 100;

  await db().transaction(async (tx) => {
    let offset = 0;
    const allIdsToUpdate: string[] = [];

    // Paginate through running segments in stable batches.
    // We use limit/offset inside a transaction to get a consistent snapshot.
    // If the dataset grows significantly, we can revisit this to use keyset
    // pagination, but this is acceptable for an upgrade script.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const segments = await tx.query.segment.findMany({
        where: eq(schema.segment.status, "Running"),
        limit: batchSize,
        offset,
      });

      if (!segments.length) {
        break;
      }

      for (const seg of segments) {
        try {
          const parsed = schemaValidateWithErr(
            seg.definition,
            SegmentDefinition,
          );
          if (parsed.isErr()) {
            logger().error(
              { segmentId: seg.id, err: parsed.error },
              "Failed to parse segment definition JSON when searching for NotExists nodes",
            );
            // eslint-disable-next-line no-continue
            continue;
          }
          const definition = parsed.value;

          const { nodes } = definition;
          const allNodes = [definition.entryNode, ...nodes];

          const hasNotExistsTraitNode = allNodes.some(
            (node) =>
              node.type === SegmentNodeType.Trait &&
              "operator" in node &&
              node.operator.type === SegmentOperatorType.NotExists,
          );

          if (hasNotExistsTraitNode) {
            allIdsToUpdate.push(seg.id);
          }
        } catch (err) {
          logger().error(
            { segmentId: seg.id, err },
            "Error while inspecting segment definition for NotExists nodes",
          );
        }
      }

      offset += segments.length;
    }

    if (allIdsToUpdate.length > 0) {
      await tx
        .update(schema.segment)
        .set({
          definitionUpdatedAt: now,
          updatedAt: now,
        })
        .where(inArray(schema.segment.id, allIdsToUpdate));

      logger().info(
        { totalUpdated: allIdsToUpdate.length },
        "Completed refreshing definitionUpdatedAt for segments with NotExists trait nodes",
      );
    } else {
      logger().info(
        "No segments with NotExists trait nodes found during refresh operation",
      );
    }
  });
}

export function transferComputedPropertyStateV2ToV3Query({
  excludeWorkspaceIds,
  limit,
  offset,
  qb,
}: {
  excludeWorkspaceIds?: string[];
  limit: number;
  offset: number;
  qb: ClickHouseQueryBuilder;
}) {
  const excludeClause =
    excludeWorkspaceIds && excludeWorkspaceIds.length > 0
      ? `WHERE workspace_id NOT IN ${qb.addQueryValue(
          excludeWorkspaceIds,
          "Array(String)",
        )}`
      : "";

  const limitClause = `LIMIT ${qb.addQueryValue(limit, "UInt64")}`;
  const offsetClause =
    offset > 0 ? `OFFSET ${qb.addQueryValue(offset, "UInt64")}` : "";

  const workspaceSubquery = `SELECT DISTINCT workspace_id
    FROM computed_property_state_v2
    ${excludeClause}
    ORDER BY workspace_id
    ${limitClause}
    ${offsetClause}`;

  return `
    INSERT INTO computed_property_state_v3
    SELECT
      workspace_id,
      type,
      computed_property_id,
      state_id,
      user_id,
      last_value,
      unique_count,
      event_time,
      grouped_message_ids,
      computed_at
    FROM computed_property_state_v2
    WHERE
      workspace_id IN (
        ${workspaceSubquery}
      )
      AND (
        workspace_id,
        type,
        computed_property_id,
        state_id,
        user_id,
        event_time
      ) NOT IN (
        SELECT
          workspace_id,
          type,
          computed_property_id,
          state_id,
          user_id,
          event_time
        FROM computed_property_state_v3
        WHERE workspace_id IN (
          ${workspaceSubquery}
        )
      )
  `;
}

interface TransferComputedPropertyStateV2ToV3Params {
  excludeWorkspaceIds?: string[];
  limit?: number;
  offset?: number;
  dryRun?: boolean;
}

export async function transferComputedPropertyStateV2ToV3({
  excludeWorkspaceIds,
  limit = 10,
  offset = 0,
  dryRun = false,
}: TransferComputedPropertyStateV2ToV3Params) {
  if (limit <= 0) {
    throw new Error("limit must be greater than 0");
  }
  if (offset < 0) {
    throw new Error("offset cannot be negative");
  }

  logger().info(
    {
      excludeWorkspaceIdsCount: excludeWorkspaceIds?.length ?? 0,
      limit,
      offset,
      dryRun,
    },
    "Transferring computed_property_state from v2 to v3",
  );

  let currentOffset = offset;
  let totalWrittenRows = 0;
  let batchCount = 0;
  let lastReadRows = 0;

  while (true) {
    const qb = new ClickHouseQueryBuilder();
    const transferQuery = transferComputedPropertyStateV2ToV3Query({
      excludeWorkspaceIds,
      limit,
      offset: currentOffset,
      qb,
    }).trim();

    if (dryRun) {
      const dryRunQuery = transferQuery
        .replace(
          /computed_property_state_v3/g,
          "dittofeed.computed_property_state_v3",
        )
        .replace(
          /computed_property_state_v2/g,
          "dittofeed.computed_property_state_v2",
        );
      logger().info(
        { query: dryRunQuery, params: qb.getQueries(), currentOffset },
        "Dry run transfer query",
      );
      batchCount += 1;
      break;
    }

    const result = await command({
      query: transferQuery,
      query_params: qb.getQueries(),
      clickhouse_settings: { wait_end_of_query: 1 },
    });

    const { summary } = result;
    const writtenRows = summary?.written_rows
      ? parseInt(summary.written_rows)
      : 0;
    const readRows = summary?.read_rows ? parseInt(summary.read_rows) : 0;
    totalWrittenRows += writtenRows;
    batchCount += 1;
    lastReadRows = readRows;

    logger().info(
      {
        batchIndex: batchCount - 1,
        currentOffset,
        limit,
        writtenRows,
        readRows,
      },
      "Executed computed_property_state transfer batch",
    );

    if (writtenRows === 0) {
      break;
    }

    currentOffset += limit;
    if (writtenRows === 0) {
      // No new rows were written for this batch, but there may still be
      // additional workspaces beyond the current offset. Continue to the next
      // page to ensure we eventually cover the entire dataset.
      // eslint-disable-next-line no-continue
      continue;
    }
  }

  const nextOffsetSuggestion = currentOffset + limit;

  logger().info(
    {
      totalWrittenRows,
      batchesExecuted: batchCount,
      finalOffset: currentOffset,
      lastReadRows,
      nextOffsetSuggestion,
    },
    "Completed computed_property_state transfer",
  );
}

export async function createComputedPropertyStateV3() {
  logger().info(
    "Creating computed_property_state_v3 table and materialized view",
  );

  await command({
    query: CREATE_COMPUTED_PROPERTY_STATE_V3_TABLE_QUERY,
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  await command({
    query: CREATE_UPDATED_COMPUTED_PROPERTY_STATE_V3_MV_QUERY,
    clickhouse_settings: { wait_end_of_query: 1 },
  });

  logger().info(
    "Finished creating computed_property_state_v3 table and materialized view",
  );
}

export async function backfillInternalEvents({
  // defaults to 1 day in minutes
  intervalMinutes = 1440,
  workspaceIds,
  startDate: startDateOverride,
  endDate: endDateOverride,
  forceFullBackfill = false,
  // defaults to 10000 rows per batch within a time window
  limit = 10000,
  dryRun = false,
}: {
  intervalMinutes?: number;
  workspaceIds?: string[];
  startDate?: string;
  endDate?: string;
  forceFullBackfill?: boolean;
  limit?: number;
  dryRun?: boolean;
}) {
  logger().info(
    dryRun
      ? "Analyzing internal events backfill (dry run)"
      : "Backfilling internal events",
  );

  // Determine start date
  let startDate: Date;
  if (startDateOverride) {
    startDate = new Date(startDateOverride);
    logger().info(
      { startDate, override: startDateOverride },
      "Using manual start date override",
    );
  } else if (forceFullBackfill) {
    // Skip internal_events check and always use min from user_events_v2
    logger().info(
      "Force full backfill enabled, skipping internal_events check",
    );
    try {
      const userEventsQb = new ClickHouseQueryBuilder();
      const userEventsWorkspaceFilter = workspaceIds
        ? `AND workspace_id IN ${userEventsQb.addQueryValue(workspaceIds, "Array(String)")}`
        : "";

      const userEventsResult = await query({
        query: `SELECT min(processing_time) as min_time FROM user_events_v2 WHERE event_type = 'track' AND startsWith(event, 'DF') ${userEventsWorkspaceFilter}`,
        query_params: userEventsQb.getQueries(),
        clickhouse_settings: { wait_end_of_query: 1 },
      });

      const minTimeResult = await userEventsResult.json<{ min_time: string }>();
      const minTime = minTimeResult[0]?.min_time;

      logger().debug(
        { minTimeResult, minTime },
        "Raw min time result from user_events_v2 (force full backfill)",
      );

      if (
        minTime &&
        minTime !== "0000-00-00 00:00:00" &&
        minTime !== "1970-01-01 00:00:00.000"
      ) {
        startDate = new Date(`${minTime}Z`);
        logger().info(
          { startDate, rawMinTime: minTime },
          "Starting from earliest DF event in user_events_v2 (force full backfill)",
        );
      } else {
        logger().info(
          "No valid DF event timestamps found in user_events_v2, nothing to backfill",
        );
        return;
      }
    } catch (error) {
      logger().error({ err: error }, "Error finding start date");
      throw error;
    }
  } else {
    // Find start date:
    // - First check if internal_events has any data, if so the processing_time start date will be the most recent processing_time from the table.
    // - If not, look up the earliest possible processing_time from user_events_v2 as the start date.
    try {
      // Check if internal_events has any data
      const qb = new ClickHouseQueryBuilder();
      const workspaceFilter = workspaceIds
        ? `WHERE workspace_id IN ${qb.addQueryValue(workspaceIds, "Array(String)")}`
        : "";

      const internalEventsResult = await query({
        query: `SELECT max(processing_time) as max_time FROM internal_events ${workspaceFilter}`,
        query_params: qb.getQueries(),
        clickhouse_settings: { wait_end_of_query: 1 },
      });

      const maxTimeResult = await internalEventsResult.json<{
        max_time: string;
      }>();

      logger().debug(
        { maxTimeResult },
        "Raw max time result from internal_events",
      );

      const maxTime = maxTimeResult[0]?.max_time;
      if (
        maxTime &&
        maxTime !== "0000-00-00 00:00:00" &&
        maxTime !== "1970-01-01 00:00:00.000"
      ) {
        startDate = new Date(`${maxTime}Z`);
        logger().info(
          { startDate, rawMaxTime: maxTime },
          "Found existing internal_events data, starting from max processing_time",
        );
      } else {
        // Get earliest processing_time from user_events_v2
        const userEventsQb = new ClickHouseQueryBuilder();
        const userEventsWorkspaceFilter = workspaceIds
          ? `AND workspace_id IN ${userEventsQb.addQueryValue(workspaceIds, "Array(String)")}`
          : "";

        const userEventsResult = await query({
          query: `SELECT min(processing_time) as min_time FROM user_events_v2 WHERE event_type = 'track' AND startsWith(event, 'DF') ${userEventsWorkspaceFilter}`,
          query_params: userEventsQb.getQueries(),
          clickhouse_settings: { wait_end_of_query: 1 },
        });

        const minTimeResult = await userEventsResult.json<{
          min_time: string;
        }>();
        const minTime = minTimeResult[0]?.min_time;

        logger().debug(
          { minTimeResult, minTime },
          "Raw min time result from user_events_v2",
        );

        if (
          minTime &&
          minTime !== "0000-00-00 00:00:00" &&
          minTime !== "1970-01-01 00:00:00.000"
        ) {
          startDate = new Date(`${minTime}Z`);
          logger().info(
            { startDate, rawMinTime: minTime },
            "Starting from earliest DF event in user_events_v2",
          );
        } else {
          logger().info(
            "No valid DF event timestamps found in user_events_v2, nothing to backfill",
          );
          return;
        }
      }
    } catch (error) {
      logger().error({ err: error }, "Error finding start date");
      throw error;
    }
  }

  // Determine end date
  const endDate = endDateOverride ? new Date(endDateOverride) : new Date();
  if (endDateOverride) {
    logger().info(
      { endDate, override: endDateOverride },
      "Using manual end date override",
    );
  }

  logger().info(
    { startDate, endDate, intervalMinutes, limit },
    "Processing date range",
  );

  // Process in chunks based on intervalMinutes
  let currentStart = startDate;

  // eslint-disable-next-line no-await-in-loop -- Sequential processing required for backfill
  while (currentStart < endDate) {
    const currentEnd = new Date(
      currentStart.getTime() + intervalMinutes * 60 * 1000,
    );

    logger().info(
      {
        currentStart: currentStart.toISOString(),
        currentEnd: currentEnd.toISOString(),
      },
      "Processing time chunk",
    );

    // Process the time chunk with limit/offset pagination
    let offset = 0;
    let totalProcessedInChunk = 0;

    // eslint-disable-next-line no-await-in-loop -- Sequential processing required for backfill
    while (true) {
      try {
        // Use query builder for proper parameterization
        const insertQb = new ClickHouseQueryBuilder();
        const startTimeParam = insertQb.addQueryValue(
          currentStart.toISOString(),
          "String",
        );
        const endTimeParam = insertQb.addQueryValue(
          currentEnd.toISOString(),
          "String",
        );
        const limitParam = insertQb.addQueryValue(limit, "UInt64");
        const offsetParam = insertQb.addQueryValue(offset, "UInt64");
        const insertWorkspaceFilter = workspaceIds
          ? `AND workspace_id IN ${insertQb.addQueryValue(workspaceIds, "Array(String)")}`
          : "";

        const insertQuery = `
          INSERT INTO internal_events (
            workspace_id,
            user_or_anonymous_id,
            user_id,
            anonymous_id,
            message_id,
            event,
            event_time,
            processing_time,
            properties,
            template_id,
            broadcast_id,
            journey_id,
            triggering_message_id,
            channel_type,
            delivery_to,
            delivery_from,
            origin_message_id,
            hidden
          )
          SELECT
            workspace_id,
            user_or_anonymous_id,
            user_id,
            anonymous_id,
            message_id,
            event,
            event_time,
            processing_time,
            properties,
            JSONExtractString(properties, 'templateId') as template_id,
            JSONExtractString(properties, 'broadcastId') as broadcast_id,
            JSONExtractString(properties, 'journeyId') as journey_id,
            JSONExtractString(properties, 'triggeringMessageId') as triggering_message_id,
            JSONExtractString(properties, 'variant', 'type') as channel_type,
            JSONExtractString(properties, 'variant', 'to') as delivery_to,
            JSONExtractString(properties, 'variant', 'from') as delivery_from,
            JSONExtractString(properties, 'messageId') as origin_message_id,
            hidden
          FROM user_events_v2
          WHERE
            event_type = 'track'
            AND startsWith(event, 'DF')
            AND processing_time >= parseDateTimeBestEffort(${startTimeParam}, 'UTC')
            AND processing_time < parseDateTimeBestEffort(${endTimeParam}, 'UTC')
            ${insertWorkspaceFilter}
            AND (workspace_id, processing_time, user_or_anonymous_id, event_time, message_id) NOT IN (
              SELECT
                workspace_id,
                processing_time,
                user_or_anonymous_id,
                event_time,
                message_id
              FROM internal_events
              WHERE
                processing_time >= parseDateTimeBestEffort(${startTimeParam}, 'UTC')
                AND processing_time < parseDateTimeBestEffort(${endTimeParam}, 'UTC')
                ${insertWorkspaceFilter}
            )
          ORDER BY workspace_id, processing_time, user_or_anonymous_id, event_time, message_id
          LIMIT ${limitParam} OFFSET ${offsetParam}
        `;

        let writtenRows = 0;
        if (dryRun) {
          logger().info(
            {
              variables: insertQb.getQueries(),
            },
            `DRY RUN - Would execute query:\n${insertQuery}`,
          );
          // For dry run, we don't know how many rows would be written, so we use the limit
          writtenRows = limit;
        } else {
          const insertResult = await command({
            query: insertQuery,
            query_params: insertQb.getQueries(),
            clickhouse_settings: { wait_end_of_query: 1 },
          });
          const writtenRowsString = insertResult.summary?.written_rows;
          writtenRows = writtenRowsString ? parseInt(writtenRowsString) : 0;
        }

        totalProcessedInChunk += writtenRows;

        logger().info(
          {
            currentStart: currentStart.toISOString(),
            currentEnd: currentEnd.toISOString(),
            offset,
            writtenRows,
            totalProcessedInChunk,
            dryRun,
          },
          dryRun
            ? "Batch analyzed successfully (dry run)"
            : "Batch processed successfully",
        );

        // If we got fewer rows than the limit, we've reached the end of data for this time chunk
        if (writtenRows < limit) {
          logger().info(
            {
              currentStart: currentStart.toISOString(),
              currentEnd: currentEnd.toISOString(),
              totalProcessedInChunk,
              dryRun,
            },
            dryRun
              ? "Completed time chunk analysis - fewer rows than limit (dry run)"
              : "Completed time chunk - fewer rows than limit",
          );
          break;
        }

        offset += limit;
      } catch (error) {
        logger().error(
          {
            err: error,
            currentStart: currentStart.toISOString(),
            currentEnd: currentEnd.toISOString(),
            offset,
            limit,
          },
          "Error processing batch",
        );
        throw error;
      }
    }

    currentStart = currentEnd;
  }

  logger().info(
    dryRun
      ? "Internal events backfill analysis completed (dry run)"
      : "Backfilling internal events completed",
  );
}

export async function addServerTimeColumn() {
  logger().info("Adding server_time column to user_events_v2");
  const serverTimeColumnQuery = `
    ALTER TABLE user_events_v2
    ADD COLUMN IF NOT EXISTS server_time DateTime64(3);
  `;
  await command({
    query: serverTimeColumnQuery,
    clickhouse_settings: { wait_end_of_query: 1 },
  });
}

export async function addHiddenColumn() {
  logger().info("Adding hidden column to user_events_v2");
  const hiddenColumnQuery = `
    ALTER TABLE user_events_v2
    ADD COLUMN IF NOT EXISTS hidden Boolean DEFAULT JSONExtractBool(
      message_raw,
      'context',
      'hidden'
    );
  `;
  await command({
    query: hiddenColumnQuery,
    clickhouse_settings: { wait_end_of_query: 1 },
  });
}

export async function createInternalEventsTable({
  backfillLimit = 50000,
  intervalMinutes = 1440,
}: {
  backfillLimit?: number;
  intervalMinutes?: number;
}) {
  logger().info("Creating internal events table and materialized view");
  const engine = await resolveMergeTreeEngine("internal_events");
  await command({
    query: buildInternalEventsTableQuery(engine),
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  await command({
    query: CREATE_INTERNAL_EVENTS_TABLE_MATERIALIZED_VIEW_QUERY,
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  logger().info("Backfilling internal events");

  await backfillInternalEvents({
    forceFullBackfill: true,
    limit: backfillLimit,
    intervalMinutes,
  });
}

export async function upgradeV023Pre({
  internalEventsBackfillLimit = 50000,
  internalEventsBackfillIntervalMinutes = 1440,
  stateExcludeWorkspaceId,
  stateLimit,
}: {
  internalEventsBackfillLimit?: number;
  internalEventsBackfillIntervalMinutes?: number;
  stateExcludeWorkspaceId?: string[];
  stateLimit?: number;
}) {
  logger().info("Performing pre-upgrade steps for v0.23.0");
  await addServerTimeColumn();
  await addHiddenColumn();
  await publicDrizzleMigrate();
  await createInternalEventsTable({
    backfillLimit: internalEventsBackfillLimit,
    intervalMinutes: internalEventsBackfillIntervalMinutes,
  });

  await terminateWorkspaceRecomputeWorkflows();
  await stopComputePropertiesWorkflowGlobal();
  await createComputedPropertyStateV3();
  await transferComputedPropertyStateV2ToV3({
    excludeWorkspaceIds: stateExcludeWorkspaceId,
    limit: stateLimit,
  });
  logger().info("Pre-upgrade steps for v0.23.0 completed.");
}

export async function upgradeV023Post() {
  logger().info("Performing post-upgrade steps for v0.23.0");
  await resetGlobalCron();
  await startComputePropertiesWorkflowGlobal();
  await refreshNotExistsSegmentDefinitionUpdatedAt();
  logger().info("Post-upgrade steps for v0.23.0 completed.");
}

export async function migrateMessageIdIndexToBloomFilter() {
  logger().info(
    "Migrating message_id index from minmax to bloom_filter on user_events_v2",
  );

  // Step 1: Drop existing minmax index
  logger().info("Dropping existing message_id_idx minmax index");
  await command({
    query: "ALTER TABLE user_events_v2 DROP INDEX IF EXISTS message_id_idx",
    clickhouse_settings: { wait_end_of_query: 1 },
  });

  // Step 2: Add bloom filter index
  logger().info("Adding message_id_idx bloom_filter index");
  await command({
    query:
      "ALTER TABLE user_events_v2 ADD INDEX message_id_idx message_id TYPE bloom_filter(0.01) GRANULARITY 4",
    clickhouse_settings: { wait_end_of_query: 1 },
  });

  // Step 3: Materialize the index on existing data
  logger().info(
    "Materializing message_id_idx index on existing data (runs in background)",
  );
  await command({
    query: "ALTER TABLE user_events_v2 MATERIALIZE INDEX message_id_idx",
    clickhouse_settings: { wait_end_of_query: 1 },
  });

  logger().info(
    "message_id index migration initiated. Use 'SELECT * FROM system.mutations WHERE table = \"user_events_v2\"' to check progress.",
  );
}

export async function createUnsubscribedSegmentsForExistingSubscriptionGroups() {
  logger().info(
    "Creating unsubscribed segments for existing subscription groups",
  );

  const subscriptionGroups = await db().query.subscriptionGroup.findMany({
    columns: {
      id: true,
      workspaceId: true,
    },
  });

  logger().info(
    { count: subscriptionGroups.length },
    "Found subscription groups to check",
  );

  let created = 0;
  let skipped = 0;

  for (const subscriptionGroup of subscriptionGroups) {
    const unsubscribedSegmentName = getSubscriptionGroupUnsubscribedSegmentName(
      subscriptionGroup.id,
    );

    // Check if unsubscribed segment already exists
    const existingSegment = await db().query.segment.findFirst({
      where: and(
        eq(schema.segment.workspaceId, subscriptionGroup.workspaceId),
        eq(schema.segment.name, unsubscribedSegmentName),
      ),
    });

    if (existingSegment) {
      skipped += 1;
      // eslint-disable-next-line no-continue
      continue;
    }

    // Create the unsubscribed segment
    const unsubscribedSegmentDefinition: SegmentDefinition = {
      entryNode: {
        type: SegmentNodeType.SubscriptionGroupUnsubscribed,
        id: "1",
        subscriptionGroupId: subscriptionGroup.id,
      },
      nodes: [],
    };

    const now = new Date();
    await insert({
      table: schema.segment,
      values: {
        name: unsubscribedSegmentName,
        workspaceId: subscriptionGroup.workspaceId,
        definition: unsubscribedSegmentDefinition,
        subscriptionGroupId: subscriptionGroup.id,
        resourceType: "Internal",
        createdAt: now,
        updatedAt: now,
      },
    }).then(unwrap);

    created += 1;
    logger().info(
      {
        subscriptionGroupId: subscriptionGroup.id,
        workspaceId: subscriptionGroup.workspaceId,
        segmentName: unsubscribedSegmentName,
      },
      "Created unsubscribed segment",
    );
  }

  logger().info(
    { created, skipped, total: subscriptionGroups.length },
    "Finished creating unsubscribed segments for existing subscription groups",
  );
}

export async function upgradeV024Pre() {
  logger().info("Performing pre-upgrade steps for v0.24.0");
  logger().info("Running postgres migrations");
  await publicDrizzleMigrate();
  await createUserSortingIndexTables();
  await migrateMessageIdIndexToBloomFilter();
  await createUnsubscribedSegmentsForExistingSubscriptionGroups();
  logger().info("Pre-upgrade steps for v0.24.0 completed.");
}

export async function backfillIdentifyEvents({
  intervalMinutes = 1440,
  workspaceIds,
  startDate: startDateOverride,
  endDate: endDateOverride,
  forceFullBackfill = false,
  limit = 10000,
  dryRun = false,
}: {
  intervalMinutes?: number;
  workspaceIds?: string[];
  startDate?: string;
  endDate?: string;
  forceFullBackfill?: boolean;
  limit?: number;
  dryRun?: boolean;
}) {
  logger().info(
    dryRun
      ? "Analyzing identify events backfill (dry run)"
      : "Backfilling identify events",
  );

  let startDate: Date;
  if (startDateOverride) {
    startDate = new Date(startDateOverride);
  } else if (forceFullBackfill) {
    const userEventsQb = new ClickHouseQueryBuilder();
    const userEventsWorkspaceFilter = workspaceIds
      ? `AND workspace_id IN ${userEventsQb.addQueryValue(workspaceIds, "Array(String)")}`
      : "";
    const userEventsResult = await query({
      query: `SELECT min(processing_time) as min_time FROM user_events_v2 WHERE event_type = 'identify' ${userEventsWorkspaceFilter}`,
      query_params: userEventsQb.getQueries(),
      clickhouse_settings: { wait_end_of_query: 1 },
    });
    const minTimeResult = await userEventsResult.json<{ min_time: string }>();
    const minTime = minTimeResult[0]?.min_time;
    if (
      !minTime ||
      minTime === "0000-00-00 00:00:00" ||
      minTime === "1970-01-01 00:00:00.000"
    ) {
      logger().info("No identify events found to backfill");
      return;
    }
    startDate = new Date(`${minTime}Z`);
  } else {
    const qb = new ClickHouseQueryBuilder();
    const workspaceFilter = workspaceIds
      ? `WHERE workspace_id IN ${qb.addQueryValue(workspaceIds, "Array(String)")}`
      : "";
    const maxResult = await query({
      query: `SELECT max(processing_time) as max_time FROM identify_events_v2 ${workspaceFilter}`,
      query_params: qb.getQueries(),
      clickhouse_settings: { wait_end_of_query: 1 },
    });
    const maxTimeResult = await maxResult.json<{ max_time: string }>();
    const maxTime = maxTimeResult[0]?.max_time;
    if (
      maxTime &&
      maxTime !== "0000-00-00 00:00:00" &&
      maxTime !== "1970-01-01 00:00:00.000"
    ) {
      startDate = new Date(`${maxTime}Z`);
    } else {
      const userEventsQb = new ClickHouseQueryBuilder();
      const userEventsWorkspaceFilter = workspaceIds
        ? `AND workspace_id IN ${userEventsQb.addQueryValue(workspaceIds, "Array(String)")}`
        : "";
      const userEventsResult = await query({
        query: `SELECT min(processing_time) as min_time FROM user_events_v2 WHERE event_type = 'identify' ${userEventsWorkspaceFilter}`,
        query_params: userEventsQb.getQueries(),
        clickhouse_settings: { wait_end_of_query: 1 },
      });
      const minTimeResult = await userEventsResult.json<{ min_time: string }>();
      const minTime = minTimeResult[0]?.min_time;
      if (
        !minTime ||
        minTime === "0000-00-00 00:00:00" ||
        minTime === "1970-01-01 00:00:00.000"
      ) {
        logger().info("No identify events found to backfill");
        return;
      }
      startDate = new Date(`${minTime}Z`);
    }
  }

  const endDate = endDateOverride ? new Date(endDateOverride) : new Date();
  const intervalMs = intervalMinutes * 60 * 1000;
  let currentStart = startDate;
  let totalInserted = 0;

  while (currentStart < endDate) {
    const currentEnd = new Date(
      Math.min(currentStart.getTime() + intervalMs, endDate.getTime()),
    );
    let offset = 0;

    while (true) {
      const insertQb = new ClickHouseQueryBuilder();
      const startTimeParam = insertQb.addQueryValue(
        currentStart.toISOString(),
        "String",
      );
      const endTimeParam = insertQb.addQueryValue(
        currentEnd.toISOString(),
        "String",
      );
      const limitParam = insertQb.addQueryValue(limit, "UInt64");
      const offsetParam = insertQb.addQueryValue(offset, "UInt64");
      const insertWorkspaceFilter = workspaceIds
        ? `AND workspace_id IN ${insertQb.addQueryValue(workspaceIds, "Array(String)")}`
        : "";

      const insertQuery = `
        INSERT INTO identify_events_v2 (
          workspace_id,
          user_or_anonymous_id,
          user_id,
          anonymous_id,
          message_id,
          properties,
          event_time,
          processing_time,
          hidden
        )
        SELECT
          workspace_id,
          user_or_anonymous_id,
          user_id,
          anonymous_id,
          message_id,
          properties,
          event_time,
          processing_time,
          hidden
        FROM user_events_v2
        WHERE
          event_type = 'identify'
          AND processing_time >= parseDateTimeBestEffort(${startTimeParam}, 'UTC')
          AND processing_time < parseDateTimeBestEffort(${endTimeParam}, 'UTC')
          ${insertWorkspaceFilter}
          AND (workspace_id, processing_time, user_or_anonymous_id, event_time, message_id) NOT IN (
            SELECT
              workspace_id,
              processing_time,
              user_or_anonymous_id,
              event_time,
              message_id
            FROM identify_events_v2
            WHERE
              processing_time >= parseDateTimeBestEffort(${startTimeParam}, 'UTC')
              AND processing_time < parseDateTimeBestEffort(${endTimeParam}, 'UTC')
              ${insertWorkspaceFilter}
          )
        ORDER BY processing_time
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `;

      if (dryRun) {
        logger().info(
          {
            start: currentStart.toISOString(),
            end: currentEnd.toISOString(),
            offset,
          },
          "Dry run identify events backfill batch",
        );
        break;
      }

      const result = await command({
        query: insertQuery,
        query_params: insertQb.getQueries(),
        clickhouse_settings: { wait_end_of_query: 1 },
      });
      const writtenRowsString = result.summary?.written_rows;
      const writtenRows = writtenRowsString ? parseInt(writtenRowsString) : 0;
      totalInserted += writtenRows;
      if (writtenRows === 0 || writtenRows < limit) {
        break;
      }
      offset += limit;
    }

    currentStart = currentEnd;
  }

  logger().info({ totalInserted }, "Completed identify events backfill");
}

export async function backfillUserTraitValues({
  intervalMinutes = 60,
  workspaceIds,
  startDate: startDateOverride,
  endDate: endDateOverride,
  forceFullBackfill = false,
  limit = 2000,
  dryRun = false,
  targetTable = USER_TRAIT_VALUES_TABLE,
}: {
  intervalMinutes?: number;
  workspaceIds?: string[];
  startDate?: string;
  endDate?: string;
  forceFullBackfill?: boolean;
  limit?: number;
  dryRun?: boolean;
  targetTable?: string;
}) {
  logger().info(
    { targetTable },
    dryRun
      ? "Analyzing user trait values backfill (dry run)"
      : "Backfilling user trait values",
  );

  let startDate: Date;
  if (startDateOverride) {
    startDate = new Date(startDateOverride);
  } else if (forceFullBackfill) {
    const identifyQb = new ClickHouseQueryBuilder();
    const identifyWorkspaceFilter = workspaceIds
      ? `WHERE workspace_id IN ${identifyQb.addQueryValue(workspaceIds, "Array(String)")}`
      : "";
    const identifyResult = await query({
      query: `SELECT min(processing_time) as min_time FROM ${IDENTIFY_EVENTS_TABLE} ${identifyWorkspaceFilter}`,
      query_params: identifyQb.getQueries(),
      clickhouse_settings: { wait_end_of_query: 1 },
    });
    const minTimeResult = await identifyResult.json<{ min_time: string }>();
    const minTime = minTimeResult[0]?.min_time;
    if (
      !minTime ||
      minTime === "0000-00-00 00:00:00" ||
      minTime === "1970-01-01 00:00:00.000"
    ) {
      logger().info("No identify events found to backfill user trait values");
      return;
    }
    startDate = new Date(`${minTime}Z`);
  } else {
    const qb = new ClickHouseQueryBuilder();
    const workspaceFilter = workspaceIds
      ? `WHERE workspace_id IN ${qb.addQueryValue(workspaceIds, "Array(String)")}`
      : "";
    const maxResult = await query({
      query: `SELECT max(processing_time) as max_time FROM ${targetTable} ${workspaceFilter}`,
      query_params: qb.getQueries(),
      clickhouse_settings: { wait_end_of_query: 1 },
    });
    const maxTimeResult = await maxResult.json<{ max_time: string }>();
    const maxTime = maxTimeResult[0]?.max_time;
    if (
      maxTime &&
      maxTime !== "0000-00-00 00:00:00" &&
      maxTime !== "1970-01-01 00:00:00.000"
    ) {
      startDate = new Date(`${maxTime}Z`);
    } else {
      const identifyQb = new ClickHouseQueryBuilder();
      const identifyWorkspaceFilter = workspaceIds
        ? `WHERE workspace_id IN ${identifyQb.addQueryValue(workspaceIds, "Array(String)")}`
        : "";
      const identifyResult = await query({
        query: `SELECT min(processing_time) as min_time FROM ${IDENTIFY_EVENTS_TABLE} ${identifyWorkspaceFilter}`,
        query_params: identifyQb.getQueries(),
        clickhouse_settings: { wait_end_of_query: 1 },
      });
      const minTimeResult = await identifyResult.json<{ min_time: string }>();
      const minTime = minTimeResult[0]?.min_time;
      if (
        !minTime ||
        minTime === "0000-00-00 00:00:00" ||
        minTime === "1970-01-01 00:00:00.000"
      ) {
        logger().info("No identify events found to backfill user trait values");
        return;
      }
      startDate = new Date(`${minTime}Z`);
    }
  }

  const endDate = endDateOverride ? new Date(endDateOverride) : new Date();
  const intervalMs = intervalMinutes * 60 * 1000;
  let currentStart = startDate;
  let totalInserted = 0;
  const includeUserId = targetTable === USER_TRAIT_VALUES_V3_TABLE;

  while (currentStart < endDate) {
    const currentEnd = new Date(
      Math.min(currentStart.getTime() + intervalMs, endDate.getTime()),
    );
    const chunkQb = new ClickHouseQueryBuilder();
    const startTimeParam = chunkQb.addQueryValue(
      currentStart.toISOString(),
      "String",
    );
    const endTimeParam = chunkQb.addQueryValue(
      currentEnd.toISOString(),
      "String",
    );
    const chunkWorkspaceFilter = workspaceIds
      ? `AND workspace_id IN ${chunkQb.addQueryValue(workspaceIds, "Array(String)")}`
      : "";

    const countResult = await query({
      query: `
        SELECT count() as cnt
        FROM ${IDENTIFY_EVENTS_TABLE}
        WHERE
          processing_time >= parseDateTimeBestEffort(${startTimeParam}, 'UTC')
          AND processing_time < parseDateTimeBestEffort(${endTimeParam}, 'UTC')
          AND length(properties) > 2
          ${chunkWorkspaceFilter}
      `,
      query_params: chunkQb.getQueries(),
      clickhouse_settings: { wait_end_of_query: 1 },
    });
    const chunkCountRows = await countResult.json<{ cnt: string }>();
    const chunkIdentifyCount = Number(chunkCountRows[0]?.cnt ?? 0);

    logger().info(
      {
        start: currentStart.toISOString(),
        end: currentEnd.toISOString(),
        chunkIdentifyCount,
      },
      "Starting user trait values time chunk",
    );

    let offset = 0;
    while (offset < chunkIdentifyCount) {
      const insertQb = new ClickHouseQueryBuilder();
      const batchStartTimeParam = insertQb.addQueryValue(
        currentStart.toISOString(),
        "String",
      );
      const batchEndTimeParam = insertQb.addQueryValue(
        currentEnd.toISOString(),
        "String",
      );
      const limitParam = insertQb.addQueryValue(limit, "UInt64");
      const offsetParam = insertQb.addQueryValue(offset, "UInt64");
      const insertWorkspaceFilter = workspaceIds
        ? `AND workspace_id IN ${insertQb.addQueryValue(workspaceIds, "Array(String)")}`
        : "";

      const insertQuery = `
        INSERT INTO ${targetTable} (
          workspace_id,
          user_or_anonymous_id,
          ${includeUserId ? "user_id," : ""}
          trait_path,
          trait_value,
          event_time,
          processing_time
        )
        ${buildUserTraitValuesBackfillInsertQuery({
          whereClause: `
          processing_time >= parseDateTimeBestEffort(${batchStartTimeParam}, 'UTC')
          AND processing_time < parseDateTimeBestEffort(${batchEndTimeParam}, 'UTC')
          AND length(properties) > 2
          ${insertWorkspaceFilter}
        `,
          identifyLimitParam: limitParam,
          identifyOffsetParam: offsetParam,
          includeUserId,
        })}
      `;

      if (dryRun) {
        logger().info(
          {
            start: currentStart.toISOString(),
            end: currentEnd.toISOString(),
            offset,
            limit,
            chunkIdentifyCount,
          },
          "Dry run user trait values backfill batch",
        );
        break;
      }

      const result = await command({
        query: insertQuery,
        query_params: insertQb.getQueries(),
        clickhouse_settings: {
          wait_end_of_query: 1,
          max_execution_time: 0,
        },
      });
      const writtenRowsString = result.summary?.written_rows;
      const writtenRows = writtenRowsString ? parseInt(writtenRowsString) : 0;
      totalInserted += writtenRows;
      logger().info(
        {
          start: currentStart.toISOString(),
          end: currentEnd.toISOString(),
          offset,
          limit,
          chunkIdentifyCount,
          writtenRows,
          totalInserted,
        },
        "User trait values backfill batch completed",
      );
      if (writtenRows === 0) {
        break;
      }
      offset += limit;
    }

    currentStart = currentEnd;
  }

  logger().info(
    { targetTable, totalInserted },
    "Completed user trait values backfill",
  );
}

export async function backfillTrackEvents({
  intervalMinutes = 1440,
  workspaceIds,
  startDate: startDateOverride,
  endDate: endDateOverride,
  forceFullBackfill = false,
  limit = 10000,
  dryRun = false,
}: {
  intervalMinutes?: number;
  workspaceIds?: string[];
  startDate?: string;
  endDate?: string;
  forceFullBackfill?: boolean;
  limit?: number;
  dryRun?: boolean;
}) {
  logger().info(
    dryRun
      ? "Analyzing track events backfill (dry run)"
      : "Backfilling track events",
  );

  let startDate: Date;
  if (startDateOverride) {
    startDate = new Date(startDateOverride);
  } else if (forceFullBackfill) {
    const userEventsQb = new ClickHouseQueryBuilder();
    const userEventsWorkspaceFilter = workspaceIds
      ? `AND workspace_id IN ${userEventsQb.addQueryValue(workspaceIds, "Array(String)")}`
      : "";
    const userEventsResult = await query({
      query: `SELECT min(processing_time) as min_time FROM user_events_v2 WHERE event_type = 'track' ${userEventsWorkspaceFilter}`,
      query_params: userEventsQb.getQueries(),
      clickhouse_settings: { wait_end_of_query: 1 },
    });
    const minTimeResult = await userEventsResult.json<{ min_time: string }>();
    const minTime = minTimeResult[0]?.min_time;
    if (
      !minTime ||
      minTime === "0000-00-00 00:00:00" ||
      minTime === "1970-01-01 00:00:00.000"
    ) {
      logger().info("No track events found to backfill");
      return;
    }
    startDate = new Date(`${minTime}Z`);
  } else {
    const qb = new ClickHouseQueryBuilder();
    const workspaceFilter = workspaceIds
      ? `WHERE workspace_id IN ${qb.addQueryValue(workspaceIds, "Array(String)")}`
      : "";
    const maxResult = await query({
      query: `SELECT max(processing_time) as max_time FROM track_events_v2 ${workspaceFilter}`,
      query_params: qb.getQueries(),
      clickhouse_settings: { wait_end_of_query: 1 },
    });
    const maxTimeResult = await maxResult.json<{ max_time: string }>();
    const maxTime = maxTimeResult[0]?.max_time;
    if (
      maxTime &&
      maxTime !== "0000-00-00 00:00:00" &&
      maxTime !== "1970-01-01 00:00:00.000"
    ) {
      startDate = new Date(`${maxTime}Z`);
    } else {
      const userEventsQb = new ClickHouseQueryBuilder();
      const userEventsWorkspaceFilter = workspaceIds
        ? `AND workspace_id IN ${userEventsQb.addQueryValue(workspaceIds, "Array(String)")}`
        : "";
      const userEventsResult = await query({
        query: `SELECT min(processing_time) as min_time FROM user_events_v2 WHERE event_type = 'track' ${userEventsWorkspaceFilter}`,
        query_params: userEventsQb.getQueries(),
        clickhouse_settings: { wait_end_of_query: 1 },
      });
      const minTimeResult = await userEventsResult.json<{ min_time: string }>();
      const minTime = minTimeResult[0]?.min_time;
      if (
        !minTime ||
        minTime === "0000-00-00 00:00:00" ||
        minTime === "1970-01-01 00:00:00.000"
      ) {
        logger().info("No track events found to backfill");
        return;
      }
      startDate = new Date(`${minTime}Z`);
    }
  }

  const endDate = endDateOverride ? new Date(endDateOverride) : new Date();
  const intervalMs = intervalMinutes * 60 * 1000;
  let currentStart = startDate;
  let totalInserted = 0;

  while (currentStart < endDate) {
    const currentEnd = new Date(
      Math.min(currentStart.getTime() + intervalMs, endDate.getTime()),
    );
    let offset = 0;

    while (true) {
      const insertQb = new ClickHouseQueryBuilder();
      const startTimeParam = insertQb.addQueryValue(
        currentStart.toISOString(),
        "String",
      );
      const endTimeParam = insertQb.addQueryValue(
        currentEnd.toISOString(),
        "String",
      );
      const limitParam = insertQb.addQueryValue(limit, "UInt64");
      const offsetParam = insertQb.addQueryValue(offset, "UInt64");
      const insertWorkspaceFilter = workspaceIds
        ? `AND workspace_id IN ${insertQb.addQueryValue(workspaceIds, "Array(String)")}`
        : "";

      const insertQuery = `
        INSERT INTO track_events_v2 (
          workspace_id,
          user_or_anonymous_id,
          user_id,
          anonymous_id,
          message_id,
          event,
          properties,
          event_time,
          processing_time,
          hidden
        )
        SELECT
          workspace_id,
          user_or_anonymous_id,
          user_id,
          anonymous_id,
          message_id,
          event,
          properties,
          event_time,
          processing_time,
          hidden
        FROM user_events_v2
        WHERE
          event_type = 'track'
          AND processing_time >= parseDateTimeBestEffort(${startTimeParam}, 'UTC')
          AND processing_time < parseDateTimeBestEffort(${endTimeParam}, 'UTC')
          ${insertWorkspaceFilter}
          AND (workspace_id, processing_time, user_or_anonymous_id, event_time, message_id) NOT IN (
            SELECT
              workspace_id,
              processing_time,
              user_or_anonymous_id,
              event_time,
              message_id
            FROM track_events_v2
            WHERE
              processing_time >= parseDateTimeBestEffort(${startTimeParam}, 'UTC')
              AND processing_time < parseDateTimeBestEffort(${endTimeParam}, 'UTC')
              ${insertWorkspaceFilter}
          )
        ORDER BY processing_time
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `;

      if (dryRun) {
        logger().info(
          {
            start: currentStart.toISOString(),
            end: currentEnd.toISOString(),
            offset,
          },
          "Dry run track events backfill batch",
        );
        break;
      }

      const result = await command({
        query: insertQuery,
        query_params: insertQb.getQueries(),
        clickhouse_settings: { wait_end_of_query: 1 },
      });
      const writtenRowsString = result.summary?.written_rows;
      const writtenRows = writtenRowsString ? parseInt(writtenRowsString) : 0;
      totalInserted += writtenRows;
      if (writtenRows === 0 || writtenRows < limit) {
        break;
      }
      offset += limit;
    }

    currentStart = currentEnd;
  }

  logger().info({ totalInserted }, "Completed track events backfill");
}

export async function migrateUserTraitValuesToReplicatedMergeTree() {
  await migrateMergeTreeToReplicatedMergeTree({
    tableName: USER_TRAIT_VALUES_TABLE,
    buildCreateTableQuery: buildUserTraitValuesTableQuery,
    materializedViewName: "user_trait_values_v2_mv",
    buildCreateMaterializedViewQuery: () =>
      CREATE_USER_TRAIT_VALUES_MATERIALIZED_VIEW_QUERY,
  });
}

export async function migrateIdentifyEventsToReplicatedMergeTree() {
  await migrateMergeTreeToReplicatedMergeTree({
    tableName: IDENTIFY_EVENTS_TABLE,
    buildCreateTableQuery: buildIdentifyEventsTableQuery,
    materializedViewName: "identify_events_v2_mv",
    buildCreateMaterializedViewQuery: () =>
      CREATE_IDENTIFY_EVENTS_MATERIALIZED_VIEW_QUERY,
  });
}

export async function migrateTrackEventsToReplicatedMergeTree() {
  await migrateMergeTreeToReplicatedMergeTree({
    tableName: TRACK_EVENTS_TABLE,
    buildCreateTableQuery: buildTrackEventsTableQuery,
    materializedViewName: "track_events_v2_mv",
    buildCreateMaterializedViewQuery: () =>
      CREATE_TRACK_EVENTS_MATERIALIZED_VIEW_QUERY,
  });
}

export async function migrateEventTablesToReplicatedMergeTree() {
  await migrateIdentifyEventsToReplicatedMergeTree();
  await migrateTrackEventsToReplicatedMergeTree();
  await migrateUserTraitValuesToReplicatedMergeTree();
}

export async function createTrackEventsTable({
  backfillLimit = 50000,
  intervalMinutes = 1440,
}: {
  backfillLimit?: number;
  intervalMinutes?: number;
} = {}) {
  logger().info("Creating track events table and materialized view");
  const engine = await resolveMergeTreeEngine(TRACK_EVENTS_TABLE);
  await command({
    query: buildTrackEventsTableQuery(engine),
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  await command({
    query: CREATE_TRACK_EVENTS_MATERIALIZED_VIEW_QUERY,
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  logger().info("Backfilling track events");
  await backfillTrackEvents({
    forceFullBackfill: true,
    limit: backfillLimit,
    intervalMinutes,
  });
}

export async function createUserTraitValuesTable({
  backfillLimit = 2000,
  intervalMinutes = 60,
}: {
  backfillLimit?: number;
  intervalMinutes?: number;
} = {}) {
  logger().info("Creating user trait values table and materialized view");
  const engine = await resolveMergeTreeEngine(USER_TRAIT_VALUES_TABLE);
  await command({
    query: buildUserTraitValuesTableQuery(engine),
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  await command({
    query: CREATE_USER_TRAIT_VALUES_MATERIALIZED_VIEW_QUERY,
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  await command({
    query: CREATE_LEGACY_USER_TRAIT_VALUES_CURRENT_VIEW_QUERY,
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  logger().info("Backfilling user trait values");
  await backfillUserTraitValues({
    forceFullBackfill: true,
    limit: backfillLimit,
    intervalMinutes,
  });
}

export async function prepareUserTraitValuesV3({
  backfillLimit = 2000,
  intervalMinutes = 60,
  workspaceIds,
  startDate,
  endDate,
  dryRun = false,
}: {
  backfillLimit?: number;
  intervalMinutes?: number;
  workspaceIds?: string[];
  startDate?: string;
  endDate?: string;
  dryRun?: boolean;
} = {}) {
  logger().info(
    {
      tableName: USER_TRAIT_VALUES_V3_TABLE,
      viewName: "user_trait_values_v3_mv",
    },
    "Preparing user trait values v3 table and materialized view",
  );
  const engine = await resolveMergeTreeEngine(USER_TRAIT_VALUES_V3_TABLE);
  await command({
    query: buildUserTraitValuesTableQuery(engine, USER_TRAIT_VALUES_V3_TABLE, {
      includeUserId: true,
    }),
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  await command({
    query: buildUserTraitValuesMaterializedViewQuery({
      tableName: USER_TRAIT_VALUES_V3_TABLE,
      viewName: "user_trait_values_v3_mv",
      includeUserId: true,
    }),
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  await command({
    query: CREATE_LEGACY_USER_TRAIT_VALUES_CURRENT_VIEW_QUERY,
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  logger().info("Backfilling user trait values v3");
  await backfillUserTraitValues({
    forceFullBackfill: !startDate,
    startDate,
    endDate,
    workspaceIds,
    limit: backfillLimit,
    intervalMinutes,
    dryRun,
    targetTable: USER_TRAIT_VALUES_V3_TABLE,
  });
}

export async function validateUserTraitValuesV3({
  workspaceIds,
}: {
  workspaceIds?: string[];
} = {}) {
  const qb = new ClickHouseQueryBuilder();
  const workspaceFilter = workspaceIds
    ? `AND workspace_id IN ${qb.addQueryValue(workspaceIds, "Array(String)")}`
    : "";
  const result = await query({
    query: `
      SELECT
        count() AS rows,
        uniqExact(user_id) AS users,
        countIf(user_id = '') AS anonymous_rows,
        min(processing_time) AS min_processing_time,
        max(processing_time) AS max_processing_time
      FROM ${USER_TRAIT_VALUES_V3_TABLE}
      WHERE 1 = 1
      ${workspaceFilter}
    `,
    query_params: qb.getQueries(),
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  const rows = await result.json<
    {
      rows: string;
      users: string;
      anonymous_rows: string;
      min_processing_time: string;
      max_processing_time: string;
    }[]
  >();
  logger().info(
    {
      tableName: USER_TRAIT_VALUES_V3_TABLE,
      stats: rows[0],
    },
    "Validated user trait values v3",
  );
}

export async function switchUserTraitValuesCurrentToV3() {
  logger().info(
    {
      viewName: USER_TRAIT_VALUES_CURRENT_VIEW,
      tableName: USER_TRAIT_VALUES_V3_TABLE,
    },
    "Switching active user trait values view to v3",
  );
  await command({
    query: `DROP VIEW IF EXISTS ${USER_TRAIT_VALUES_CURRENT_VIEW}`,
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  await command({
    query: CREATE_V3_USER_TRAIT_VALUES_CURRENT_VIEW_QUERY,
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  logger().info("Switched active user trait values view to v3");
}

export async function cleanupUserTraitValuesV2() {
  logger().info("Dropping legacy user trait values v2 materialized view");
  await command({
    query: "DROP VIEW IF EXISTS user_trait_values_v2_mv",
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  logger().info("Dropping legacy user trait values v2 table");
  await command({
    query: `DROP TABLE IF EXISTS ${USER_TRAIT_VALUES_TABLE}`,
    clickhouse_settings: { wait_end_of_query: 1 },
  });
}

export async function createIdentifyEventsTable({
  backfillLimit = 50000,
  intervalMinutes = 1440,
}: {
  backfillLimit?: number;
  intervalMinutes?: number;
} = {}) {
  logger().info("Creating identify events table and materialized view");
  const engine = await resolveMergeTreeEngine(IDENTIFY_EVENTS_TABLE);
  await command({
    query: buildIdentifyEventsTableQuery(engine),
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  await command({
    query: CREATE_IDENTIFY_EVENTS_MATERIALIZED_VIEW_QUERY,
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  logger().info("Backfilling identify events");
  await backfillIdentifyEvents({
    forceFullBackfill: true,
    limit: backfillLimit,
    intervalMinutes,
  });
}

export async function upgradeV025Pre({
  identifyEventsBackfillLimit = 50000,
  identifyEventsBackfillIntervalMinutes = 1440,
  trackEventsBackfillLimit = 50000,
  trackEventsBackfillIntervalMinutes = 1440,
}: {
  identifyEventsBackfillLimit?: number;
  identifyEventsBackfillIntervalMinutes?: number;
  trackEventsBackfillLimit?: number;
  trackEventsBackfillIntervalMinutes?: number;
} = {}) {
  logger().info("Performing pre-upgrade steps for v0.25.0");
  await migrateIdentifyEventsToReplicatedMergeTree();
  await createIdentifyEventsTable({
    backfillLimit: identifyEventsBackfillLimit,
    intervalMinutes: identifyEventsBackfillIntervalMinutes,
  });
  await createTrackEventsTable({
    backfillLimit: trackEventsBackfillLimit,
    intervalMinutes: trackEventsBackfillIntervalMinutes,
  });
  await createUserTraitValuesTable({
    backfillLimit: identifyEventsBackfillLimit,
    intervalMinutes: identifyEventsBackfillIntervalMinutes,
  });
  logger().info("Pre-upgrade steps for v0.25.0 completed.");
}
