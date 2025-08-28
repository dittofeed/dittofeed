/* eslint-disable no-await-in-loop */
import {
  ClickHouseQueryBuilder,
  command,
  query,
} from "backend-lib/src/clickhouse";
import {
  resetComputePropertiesWorkflows,
  resetGlobalCron,
  startComputePropertiesWorkflow,
  startComputePropertiesWorkflowGlobal,
  stopComputePropertiesWorkflowGlobal,
  terminateComputePropertiesWorkflow,
} from "backend-lib/src/computedProperties/computePropertiesWorkflow/lifecycle";
import { db, insert } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import logger from "backend-lib/src/logger";
import { publicDrizzleMigrate } from "backend-lib/src/migrate";
import {
  EmailProviderSecret,
  EmailProviderType,
  Workspace,
} from "backend-lib/src/types";
import {
  CREATE_INTERNAL_EVENTS_TABLE_MATERIALIZED_VIEW_QUERY,
  CREATE_INTERNAL_EVENTS_TABLE_QUERY,
  createUserEventsTables,
  GROUP_MATERIALIZED_VIEWS,
  GROUP_TABLES,
} from "backend-lib/src/userEvents/clickhouse";
import { and, eq, inArray } from "drizzle-orm";
import { SecretNames } from "isomorphic-lib/src/constants";
import { parseInt } from "isomorphic-lib/src/numbers";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

import { spawnWithEnv, spawnWithEnvSafe } from "./spawn";

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

export async function backfillInternalEvents({
  // defaults to 1 day in minutes
  intervalMinutes = 1440,
  workspaceIds,
  startDate: startDateOverride,
  endDate: endDateOverride,
  forceFullBackfill = false,
  // defaults to 10000 rows per batch within a time window
  limit = 10000,
}: {
  intervalMinutes?: number;
  workspaceIds?: string[];
  startDate?: string;
  endDate?: string;
  forceFullBackfill?: boolean;
  limit?: number;
}) {
  logger().info("Backfilling internal events");

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
          LIMIT ${limitParam} OFFSET ${offsetParam}
        `;

        const insertResult = await command({
          query: insertQuery,
          query_params: insertQb.getQueries(),
          clickhouse_settings: { wait_end_of_query: 1 },
        });
        const writtenRowsString = insertResult.summary?.written_rows;
        const writtenRows = writtenRowsString ? parseInt(writtenRowsString) : 0;

        totalProcessedInChunk += writtenRows;

        logger().info(
          {
            currentStart: currentStart.toISOString(),
            currentEnd: currentEnd.toISOString(),
            offset,
            writtenRows,
            totalProcessedInChunk,
          },
          "Batch processed successfully",
        );

        // If we got fewer rows than the limit, we've reached the end of data for this time chunk
        if (writtenRows < limit) {
          logger().info(
            {
              currentStart: currentStart.toISOString(),
              currentEnd: currentEnd.toISOString(),
              totalProcessedInChunk,
            },
            "Completed time chunk - fewer rows than limit",
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

  logger().info("Backfilling internal events completed");
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
  await command({
    query: CREATE_INTERNAL_EVENTS_TABLE_QUERY,
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
}: {
  internalEventsBackfillLimit?: number;
  internalEventsBackfillIntervalMinutes?: number;
}) {
  logger().info("Performing pre-upgrade steps for v0.23.0");
  await addServerTimeColumn();
  await addHiddenColumn();
  await publicDrizzleMigrate();
  await createInternalEventsTable({
    backfillLimit: internalEventsBackfillLimit,
    intervalMinutes: internalEventsBackfillIntervalMinutes,
  });
  logger().info("Pre-upgrade steps for v0.23.0 completed.");
}

export async function upgradeV023Post() {
  logger().info("Performing post-upgrade steps for v0.23.0");
  await resetComputePropertiesWorkflows({
    all: true,
  });
  await resetGlobalCron();
  await stopComputePropertiesWorkflowGlobal();
  await startComputePropertiesWorkflowGlobal();
  logger().info("Post-upgrade steps for v0.23.0 completed.");
}
