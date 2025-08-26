import { command } from "backend-lib/src/clickhouse";
import {
  startComputePropertiesWorkflow,
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
  createUserEventsTables,
  GROUP_MATERIALIZED_VIEWS,
  GROUP_TABLES,
} from "backend-lib/src/userEvents/clickhouse";
import { and, eq, inArray } from "drizzle-orm";
import { SecretNames } from "isomorphic-lib/src/constants";
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
}: {
  intervalMinutes: number;
}) {
  // Find start date:
  // - First check if internal_events has any data, if so the processing_time start date will be the most recent processing_time from the table.
  // - If not, look up the earliest possible processing_time from user_events_v2 as the start date.
  // - Then iterate over all rows in user_events_v2, checking the processing_time and event_time columns.

  // Iterate over chunks of user_events_v2, using the intervalMinutes to determine the window of processing_time's to process.
  // INSERT INTO dittofeed.internal_events (
  //   workspace_id,
  //   user_or_anonymous_id,
  //   user_id,
  //   anonymous_id,
  //   message_id,
  //   event,
  //   event_time,        -- event_time is column 7
  //   processing_time,   -- processing_time is column 8
  //   properties,
  //   template_id,
  //   broadcast_id,
  //   journey_id,
  //   triggering_message_id,
  //   channel_type,
  //   delivery_to,
  //   delivery_from,
  //   origin_message_id,
  //   hidden
  // )
  // SELECT
  //   workspace_id,
  //   user_or_anonymous_id,
  //   user_id,
  //   anonymous_id,
  //   message_id,
  //   event,
  //   event_time,        -- Selecting event_time for column 7
  //   processing_time,   -- Selecting processing_time for column 8
  //   properties,
  //   JSONExtractString(properties, 'templateId') as template_id,
  //   JSONExtractString(properties, 'broadcastId') as broadcast_id,
  //   JSONExtractString(properties, 'journeyId') as journey_id,
  //   JSONExtractString(properties, 'triggeringMessageId') as triggering_message_id,
  //   JSONExtractString(properties, 'variant', 'type') as channel_type,
  //   JSONExtractString(properties, 'variant', 'to') as delivery_to,
  //   JSONExtractString(properties, 'variant', 'from') as delivery_from,
  //   JSONExtractString(properties, 'messageId') as origin_message_id,
  //   hidden
  // FROM dittofeed.user_events_v2
  // WHERE event_type = 'track' AND startsWith(event, 'DF');
  logger().info("Backfilling internal events");
  logger().info("Done.");
}
