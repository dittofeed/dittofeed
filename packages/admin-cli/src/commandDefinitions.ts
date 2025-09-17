/* eslint-disable no-await-in-loop */
import { Type } from "@sinclair/typebox";
import { createAdminApiKey } from "backend-lib/src/adminApiKeys";
import { submitTrackWithTriggers } from "backend-lib/src/apps";
import { submitBatch } from "backend-lib/src/apps/batch";
import {
  bootstrapBlobStorage,
  bootstrapClickhouse,
  bootstrapKafka,
} from "backend-lib/src/bootstrap";
import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  createClickhouseClient,
} from "backend-lib/src/clickhouse";
import { computeState } from "backend-lib/src/computedProperties/computePropertiesIncremental";
import {
  COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
  getQueueStateQuery,
} from "backend-lib/src/computedProperties/computePropertiesQueueWorkflow";
import {
  resetComputePropertiesWorkflows,
  resetGlobalCron,
  startComputePropertiesWorkflow,
  startComputePropertiesWorkflowGlobal,
  stopComputePropertiesWorkflow,
  stopComputePropertiesWorkflowGlobal,
  terminateComputePropertiesWorkflow,
  terminateWorkspaceRecomputeWorkflows,
} from "backend-lib/src/computedProperties/computePropertiesWorkflow/lifecycle";
import {
  findDueWorkspaceMaxTos,
  findDueWorkspaceMinTos,
} from "backend-lib/src/computedProperties/periods";
import backendConfig, { SECRETS } from "backend-lib/src/config";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { workspace as dbWorkspace } from "backend-lib/src/db/schema";
import { buildDeliverySearchQuery } from "backend-lib/src/deliveries";
import { findBaseDir } from "backend-lib/src/dir";
import { addFeatures, removeFeatures } from "backend-lib/src/features";
import { getKeyedUserJourneyWorkflowIdInner } from "backend-lib/src/journeys/userWorkflow";
import logger from "backend-lib/src/logger";
import { publicDrizzleMigrate } from "backend-lib/src/migrate";
import { onboardUser } from "backend-lib/src/onboarding";
import { findManySegmentResourcesSafe } from "backend-lib/src/segments";
import connectWorkflowClient from "backend-lib/src/temporal/connectWorkflowClient";
import { transferResources } from "backend-lib/src/transferResources";
import { NodeEnvEnum, UserEvent, Workspace } from "backend-lib/src/types";
import { buildUserEventsQuery } from "backend-lib/src/userEvents";
import { findAllUserPropertyResources } from "backend-lib/src/userProperties";
import { deleteAllUsers, getUsers } from "backend-lib/src/users";
import {
  activateTombstonedWorkspace,
  pauseWorkspace,
  resumeWorkspace,
  tombstoneWorkspace,
} from "backend-lib/src/workspaces";
import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import fs from "fs/promises";
import { SecretNames } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  jsonParseSafeWithSchema,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  BatchItem,
  ChannelType,
  EmailProviderType,
  EventType,
  FeatureName,
  Features,
  InternalEventType,
  KnownTrackData,
  MessageTemplateResourceDefinition,
  SendgridSecret,
  UserEventV2,
} from "isomorphic-lib/src/types";
import path from "path";
import readline from "readline";
import * as R from "remeda";
import { validate as validateUuid } from "uuid";
import { Argv } from "yargs";

import { boostrapOptions, bootstrapHandler } from "./bootstrap";
import { hubspotSync } from "./hubspot";
import { resetWorkspaceData } from "./reset";
import { spawnWithEnv } from "./spawn";
import {
  backfillInternalEvents,
  disentangleResendSendgrid,
  transferComputedPropertyStateV2ToV3Query,
  upgradeV010Post,
  upgradeV010Pre,
  upgradeV012Pre,
  upgradeV021Pre,
  upgradeV023Post,
  upgradeV023Pre,
} from "./upgrades";

export function createCommands(yargs: Argv): Argv {
  return yargs
    .command(
      "bootstrap",
      "Initialize the dittofeed application and creates a workspace.",
      boostrapOptions,
      bootstrapHandler,
    )
    .command(
      "print-transfer-computed-property-state-v2-v3-query",
      "Prints the ClickHouse query used to copy computed_property_state_v2 rows into computed_property_state_v3.",
      (cmd) =>
        cmd
          .option("exclude-workspace-id", {
            type: "string",
            describe: "Workspace ID to exclude from the transfer (repeatable).",
            array: true,
          })
          .option("limit", {
            type: "number",
            describe:
              "Maximum number of distinct workspaces to include in the batch (default 64).",
            default: 64,
          })
          .option("offset", {
            type: "number",
            describe:
              "Number of distinct workspaces to skip before selecting the batch (default 0).",
            default: 0,
          }),
      ({ excludeWorkspaceId, limit, offset }) => {
        logger().info(
          { excludeWorkspaceId, limit, offset },
          "Building transfer computed property state query",
        );
        let excludeWorkspaceIds: string[] | undefined;
        if (Array.isArray(excludeWorkspaceId)) {
          excludeWorkspaceIds = excludeWorkspaceId.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          );
        }

        if (typeof limit !== "number" || Number.isNaN(limit) || limit <= 0) {
          throw new Error("limit must be a positive number");
        }
        if (typeof offset !== "number" || Number.isNaN(offset) || offset < 0) {
          throw new Error("offset must be a non-negative number");
        }

        const qb = new ClickHouseQueryBuilder({ debug: true });
        const queryString = transferComputedPropertyStateV2ToV3Query({
          excludeWorkspaceIds,
          limit,
          offset,
          qb,
        });
        const productionQuery = queryString
          .replace(/computed_property_state_v3/g, "dittofeed.computed_property_state_v3")
          .replace(/computed_property_state_v2/g, "dittofeed.computed_property_state_v2");

        console.log(productionQuery.trim());
      },
    )
    .command(
      "bootstrap-worker",
      "Bootstrap worker.",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            require: true,
            describe: "The workspace id to bootstrap.",
          },
        }),
      ({ workspaceId }) => startComputePropertiesWorkflow({ workspaceId }),
    )
    .command(
      "bootstrap-clickhouse",
      "Bootstraps clickhouse.",
      (y) => y,
      async () => {
        await bootstrapClickhouse();
      },
    )
    .command(
      "bootstrap-blob-storage",
      "Bootstraps blob storage.",
      (y) => y,
      async () => {
        await bootstrapBlobStorage();
      },
    )
    .command(
      "bootstrap-kafka",
      "Bootstraps kafka.",
      (y) => y,
      async () => {
        await bootstrapKafka();
      },
    )
    .command(
      "spawn",
      "Spawns a shell command, with dittofeed's config exported as environment variables.",
      (y) => y,
      () => spawnWithEnv(process.argv.slice(3)),
    )
    .command(
      "prisma",
      "Spawns prisma with dittofeed's config exported as environment variables.",
      (y) => y,
      () =>
        spawnWithEnv(
          ["yarn", "workspace", "backend-lib", "prisma"].concat(
            process.argv.slice(3),
          ),
        ),
    )
    .command(
      "psql",
      "Spawns psql with dittofeed's config used to authenticate.",
      (y) => y,
      () => spawnWithEnv(["psql", backendConfig().databaseUrl]),
    )
    .command(
      "psql-exec",
      "Executes a psql command with dittofeed's config used to authenticate.",
      (cmd) =>
        cmd.options({
          command: { type: "string", alias: "c", require: true },
        }),
      ({ command }) =>
        spawnWithEnv(["psql", backendConfig().databaseUrl, "-c", command]),
    )
    .command(
      "clickhouse-client",
      "Spawns clickhouse-client with dittofeed's config used to authenticate.",
      (y) => y,
      async () => {
        const { clickhouseHost, clickhousePassword } = backendConfig();
        const host = new URL(clickhouseHost).hostname;
        spawnWithEnv([
          "clickhouse-client",
          "client",
          `--host=${host}`,
          "--",
          "--secure",
          `--pasword=${clickhousePassword}`,
        ]);
      },
    )
    .command(
      "clickhouse client",
      "Spawns 'clickhouse client' with dittofeed's config used to authenticate. Useful for local development for users that installed both clickhouse server and client.",
      (y) => y,
      async () => {
        const { clickhouseHost, clickhousePassword } = backendConfig();
        const host = new URL(clickhouseHost).hostname;
        spawnWithEnv([
          "clickhouse",
          "client",
          `--host=${host}`,
          "--",
          "--secure",
          `--pasword=${clickhousePassword}`,
        ]);
      },
    )
    .command(
      "onboard-user",
      "Onboards a user to a workspace.",
      (cmd) =>
        cmd.options({
          email: { type: "string", demandOption: true },
          "workspace-name": { type: "string", demandOption: true },
        }),
      // eslint-disable-next-line prefer-arrow-callback
      async function onboardHandler({
        workspaceName,
        email,
      }: {
        workspaceName: string;
        email: string;
      }) {
        const onboardUserResult = await onboardUser({ workspaceName, email });
        unwrap(onboardUserResult);
      },
    )
    .command(
      "hubspot-sync",
      "Syncs fake user info to hubspot.",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            require: true,
            describe: "The workspace id to bootstrap.",
          },
          email: {
            require: true,
            type: "string",
            alias: "e",
            describe: "The email of the contact in hubspot",
          },
          from: {
            type: "string",
            alias: "f",
            describe: "The email of the owner in hubspot",
          },
          "update-email": {
            type: "boolean",
            alias: "u",
            describe:
              "Whether to update the email record. Defaults to creating.",
          },
        }),
      ({ workspaceId, email, from, updateEmail }) =>
        hubspotSync({ workspaceId, email, from, updateEmail }),
    )
    .command(
      "reset-compute-properties",
      "Resets compute properties workflow.",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            describe:
              "The workspace id of computed property workflows to reset. Can provide multiple comma separated ids. If not provided will apply to all workspaces.",
          },
          all: {
            type: "boolean",
            alias: "a",
            describe: "Whether to reset all computed property workflows.",
          },
        }),
      async ({ workspaceId, all }) => {
        await resetComputePropertiesWorkflows({
          workspaceId,
          all,
        });
      },
    )
    .command(
      "stop-compute-properties",
      "Stops compute properties workflow.",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            array: true,
            alias: "w",
            require: true,
            describe:
              "The workspace id of computed property workflows to stop. Can provide multiple comma separated ids. If not provided will apply to all workspaces.",
          },
        }),
      async ({ workspaceId }) => {
        const workspaces = await db().query.workspace.findMany({
          where: inArray(schema.workspace.id, workspaceId),
        });
        await Promise.all(
          workspaces.map(async (workspace) => {
            await stopComputePropertiesWorkflow({
              workspaceId: workspace.id,
            });
            logger().info(
              `Stopped compute properties workflow for workspace ${workspace.name} ${workspace.id}.`,
            );
          }),
        );
        logger().info("Done.");
      },
    )
    .command(
      "terminate-workspace-recompute-workflows",
      "Terminates deprecated per-workspace computed property workflows by iterating all workspaces.",
      (y) => y,
      async () => {
        await terminateWorkspaceRecomputeWorkflows();
        logger().info("Done.");
      },
    )
    .command(
      "terminate-compute-properties",
      "Terminates compute properties workflow.",
      (cmd) =>
        cmd.options({
          "workspace-id": { type: "string", alias: "w", require: true },
        }),
      async ({ workspaceId }) => {
        await terminateComputePropertiesWorkflow({ workspaceId });
        logger().info("Done.");
      },
    )
    .command(
      "reset-global-cron",
      "Resets global cron job.",
      (y) => y,
      async () => {
        await resetGlobalCron();
        logger().info("Done.");
      },
    )
    .command(
      "config-print",
      "Prints the backend config used by dittofeed aplications.",
      (y) => y,
      () => {
        const config = backendConfig();
        const redactedConfig = R.mapValues(config, (value, key) => {
          // Cast key to satisfy type checker with SECRETS set
          const k = key as keyof typeof config;
          return SECRETS.has(k) ? "****" : value;
        });
        logger().info(redactedConfig, "Backend Config (redacted)");
      },
    )
    .command(
      "migrations email-provider-secret",
      "Runs migrations, copying api keys on email providers to the secrets table.",
      (y) => y,
      async () => {
        await db().transaction(async (pTx) => {
          const emailProviders = await pTx.query.emailProvider.findMany();
          await Promise.all(
            emailProviders.map(async (emailProvider) => {
              const webhookSecret = await pTx.query.secret.findFirst({
                where: and(
                  eq(schema.secret.workspaceId, emailProvider.workspaceId),
                  eq(schema.secret.name, SecretNames.SendGrid),
                ),
              });
              const sendgridSecretDefinition: SendgridSecret = {
                apiKey: emailProvider.apiKey ?? undefined,
                webhookKey: webhookSecret?.value ?? undefined,
                type: EmailProviderType.SendGrid,
              };
              const [secret] = await pTx
                .insert(schema.secret)
                .values({
                  id: randomUUID(),
                  workspaceId: emailProvider.workspaceId,
                  name: SecretNames.SendGrid,
                  configValue: sendgridSecretDefinition,
                  updatedAt: new Date(),
                  createdAt: new Date(),
                })
                .returning();
              if (!secret) {
                logger().error(
                  { emailProvider },
                  "Failed to create secret for email provider",
                );
                throw new Error("Failed to create secret for email provider");
              }
              await pTx
                .update(schema.emailProvider)
                .set({
                  secretId: secret.id,
                })
                .where(eq(schema.emailProvider.id, emailProvider.id));
            }),
          );
        });
      },
    )
    .command(
      "migrations disentangle-resend-sendgrid",
      "Runs migration, disentangling the resend and sendgrid email providers.",
      (y) => y,
      () => disentangleResendSendgrid(),
    )
    .command(
      "admin-api-key create",
      "Creates an admin API key in the relevant workspace.",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            require: true,
          },
          name: {
            type: "string",
            alias: "n",
            require: true,
          },
        }),
      async ({ workspaceId, name }) => {
        const result = await createAdminApiKey({ workspaceId, name });
        if (result.isErr()) {
          logger().error(result.error, "Failed to create admin API key");
          return;
        }
        logger().info(result.value, "Created admin API Key");
      },
    )
    .command(
      "compute-state",
      "Manually re-run the computeState step of the compute properties workflow.",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            require: true,
          },
          "end-date": {
            type: "number",
            alias: "e",
            require: true,
            describe:
              "The end date of the compute state step as a unix timestamp in ms.",
          },
        }),
      async ({ workspaceId, endDate }) => {
        const [userProperties, segments] = await Promise.all([
          findAllUserPropertyResources({
            workspaceId,
          }),
          findManySegmentResourcesSafe({
            workspaceId,
          }),
        ]);

        await computeState({
          workspaceId,
          segments: segments.flatMap((s) => {
            if (s.isErr()) {
              logger().error({ err: s.error }, "failed to enrich segment");
              return [];
            }
            return s.value;
          }),
          userProperties,
          now: endDate,
        });
        logger().info("Done.");
      },
    )
    .command(
      "export-templates",
      "Export zip file with templates.",
      (y) => y,
      async () => {
        logger().info("Exporting templates...");
        const baseDir = findBaseDir();
        const tmpDir = path.join(baseDir, ".tmp", `templates-${Date.now()}`);
        const workspaces = await db().query.workspace.findMany();
        const promises: Promise<string>[] = workspaces.map(
          async (workspace) => {
            const workspaceDir = path.join(tmpDir, workspace.name);
            const templates = await db().query.messageTemplate.findMany({
              where: eq(schema.messageTemplate.workspaceId, workspace.id),
            });
            const templatePromises = templates.flatMap(async (template) => {
              const definitionResult = schemaValidateWithErr(
                template.definition,
                MessageTemplateResourceDefinition,
              );
              if (definitionResult.isErr()) {
                logger().error(
                  { err: definitionResult.error },
                  "Failed to validate template definition",
                );
                return [];
              }
              const templateDir = path.join(workspaceDir, template.name);
              await fs.mkdir(templateDir, { recursive: true });

              const definition = definitionResult.value;
              let files: { path: string; contents: string }[];
              switch (definition.type) {
                case ChannelType.Email: {
                  const bodyContents: string =
                    "EmailContentsType" in definition &&
                    typeof definition.body === "string"
                      ? definition.body
                      : JSON.stringify(definition.body);

                  files = [
                    {
                      path: path.join(templateDir, "body.liquid.html"),
                      contents: bodyContents,
                    },
                    {
                      path: path.join(templateDir, "subject.liquid.html"),
                      contents: definition.subject,
                    },
                    {
                      path: path.join(templateDir, "from.liquid.html"),
                      contents: definition.from,
                    },
                  ];
                  if (definition.replyTo) {
                    files.push({
                      path: path.join(templateDir, "reply-to.liquid.html"),
                      contents: definition.replyTo,
                    });
                  }
                  break;
                }
                default: {
                  logger().info(
                    {
                      name: template.name,
                      id: template.id,
                      workspaceName: workspace.name,
                      type: definition.type,
                    },
                    "Skipping template due to unhandled type.",
                  );
                  return [];
                }
              }

              return files.map((f) =>
                fs.writeFile(f.path, f.contents, {
                  encoding: "utf-8",
                  flag: "w+",
                }),
              );
            });
            await Promise.all(templatePromises);
            return workspaceDir;
          },
        );
        await Promise.all(promises);
        logger().info(
          {
            dir: tmpDir,
          },
          "Finished exporting templates.",
        );
      },
    )
    .command(
      "upgrade-0-10-0-pre",
      "Run the pre-upgrade steps for the 0.10.0 prior to updating your Dittofeed application version.",
      (y) => y,
      async () => {
        await upgradeV010Pre();
      },
    )
    .command(
      "upgrade-0-10-0-post",
      "Run the post-upgrade steps for the 0.10.0 after updating your Dittofeed application version.",
      (y) => y,
      async () => {
        await upgradeV010Post();
      },
    )
    .command(
      "upgrade-0-12-1-pre",
      "Run the post-upgrade steps for the 0.10.0 after updating your Dittofeed application version.",
      (y) => y,
      async () => {
        await upgradeV012Pre();
      },
    )
    .command(
      "upgrade-0-21-0-pre",
      "Run the pre-upgrade steps for the 0.21.0 prior to updating your Dittofeed application version.",
      (y) => y,
      async () => {
        await upgradeV021Pre();
      },
    )
    .command(
      "upgrade-0-23-0-pre",
      "Run the pre-upgrade steps for the 0.23.0 prior to updating your Dittofeed application version.",
      (cmd) =>
        cmd.options({
          "internal-events-backfill-limit": {
            type: "number",
            alias: "l",
            default: 50000,
            describe:
              "The page limit for the internal events backfill. Default is 50000 events per page.",
          },
          "internal-events-backfill-interval-minutes": {
            type: "number",
            alias: "m",
            default: 1440,
            describe:
              "The interval in minutes for the internal events backfill. Default is 1 day.",
          },
        }),
      async ({
        internalEventsBackfillLimit,
        internalEventsBackfillIntervalMinutes,
      }) => {
        await upgradeV023Pre({
          internalEventsBackfillLimit,
          internalEventsBackfillIntervalMinutes,
        });
      },
    )
    .command(
      "upgrade-0-23-0-post",
      "Run the post-upgrade steps for the 0.23.0 after updating your Dittofeed application version.",
      (y) => y,
      async () => {
        await upgradeV023Post();
      },
    )
    .command(
      "backfill-internal-events",
      "Backfill internal_events table from user_events_v2 data.",
      (cmd) =>
        cmd.options({
          "interval-minutes": {
            type: "number",
            alias: "i",
            default: 1440,
            describe:
              "Interval in minutes for processing chunks (default: 1 day)",
          },
          "workspace-ids": {
            type: "string",
            alias: "w",
            array: true,
            describe:
              "Optional list of workspace IDs to process (if not provided, processes all workspaces)",
          },
          "start-date": {
            type: "string",
            alias: "s",
            describe:
              "Manual start date override in ISO format (e.g., '2023-01-01T00:00:00Z')",
          },
          "end-date": {
            type: "string",
            alias: "e",
            describe:
              "Manual end date override in ISO format (e.g., '2023-12-31T23:59:59Z')",
          },
          "force-full-backfill": {
            type: "boolean",
            alias: "f",
            default: false,
            describe:
              "Skip internal_events check and always start from earliest user_events_v2 date",
          },
          limit: {
            type: "number",
            alias: "l",
            default: 10000,
            describe:
              "Number of rows to process per batch within each time window (default: 10000)",
          },
          "dry-run": {
            type: "boolean",
            alias: "d",
            default: false,
            describe: "Only log the insert queries without executing them",
          },
        }),
      async ({
        intervalMinutes,
        workspaceIds,
        startDate,
        endDate,
        forceFullBackfill,
        limit,
        dryRun,
      }) => {
        await backfillInternalEvents({
          intervalMinutes,
          workspaceIds,
          startDate,
          endDate,
          forceFullBackfill,
          limit,
          dryRun,
        });
      },
    )
    .command(
      "transfer-resources",
      "Transfer resources from one workspace to another.",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            require: true,
            describe: "The workspace id to transfer resources from.",
          },
          "destination-workspace-id": {
            type: "string",
            alias: "d",
            require: true,
            describe: "The workspace id to transfer resources to.",
          },
        }),
      async ({ workspaceId, destinationWorkspaceId }) => {
        await transferResources({ workspaceId, destinationWorkspaceId });
      },
    )
    .command(
      "reset-workspace-data",
      "Resets workspace data. Leaves resources intact.",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            require: true,
          },
        }),
      ({ workspaceId }) => resetWorkspaceData({ workspaceId }),
    )
    .command(
      "activate-tombstoned-workspace",
      "Activates a tombstoned workspace.",
      (cmd) =>
        cmd.options({
          "workspace-id": { type: "string", alias: "w", require: true },
        }),
      async ({ workspaceId }) => {
        const result = await activateTombstonedWorkspace(workspaceId);
        if (result.isErr()) {
          logger().error(
            result.error,
            "Failed to activate tombstoned workspace",
          );
          return;
        }
        logger().info("Activated tombstoned workspace.");
      },
    )
    .command(
      "tombstone-workspace",
      "Tombstones a workspace.",
      (cmd) =>
        cmd.options({
          "workspace-id": { type: "string", alias: "w", require: true },
        }),
      async ({ workspaceId }) => {
        const result = await tombstoneWorkspace(workspaceId);
        if (result.isErr()) {
          logger().error(result.error, "Failed to tombstone workspace");
          return;
        }
        logger().info("Tombstoned workspace.");
      },
    )
    .command(
      "create-admin-api-key",
      "Creates an admin API key.",
      (cmd) =>
        cmd.options({
          "workspace-name": { type: "string", alias: "w", require: true },
          name: { type: "string", alias: "n", require: true },
        }),
      async ({ workspaceName, name }) => {
        const workspace = await db().query.workspace.findFirst({
          where: eq(schema.workspace.name, workspaceName),
        });
        if (!workspace) {
          logger().error(
            { workspaceName },
            "Failed to find workspace to create admin API key",
          );
          return;
        }
        const result = await createAdminApiKey({
          workspaceId: workspace.id,
          name,
        });
        if (result.isErr()) {
          logger().error(result.error, "Failed to create admin API key");
          return;
        }
        logger().info(result.value, "Created admin API key");
      },
    )
    .command(
      "add-features",
      "Adds features to a workspace.",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            require: true,
            array: true,
          },
          features: { type: "string", alias: "f", require: true },
        }),
      async ({ workspaceId, features: featuresString }) => {
        const features = jsonParseSafeWithSchema(featuresString, Features, {
          method: "standard",
        });
        if (features.isErr()) {
          logger().error(features.error, "Failed to parse features");
          return;
        }
        logger().info(
          { features, workspaceId },
          "Adding features to workspace.",
        );
        await addFeatures({ workspaceId, features: features.value });
        logger().info("Added features to workspace.");
      },
    )
    .command(
      "remove-features",
      "Removes features from a workspace.",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            require: true,
            array: true,
          },
          features: { type: "string", alias: "f", require: true, array: true },
        }),
      async ({ workspaceId, features: unvalidatedFeatures }) => {
        const features = schemaValidateWithErr(
          unvalidatedFeatures,
          Type.Array(FeatureName),
        );
        logger().info(
          { features, workspaceId },
          "Removing features from workspace.",
        );
        if (features.isErr()) {
          logger().error(features.error, "Failed to parse features");
          return;
        }
        await removeFeatures({ workspaceId, names: features.value });
        logger().info("Removed features from workspace.");
      },
    )
    .command(
      "pause-workspace",
      "Pauses a workspace.",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            require: true,
            array: true,
          },
        }),
      async ({ workspaceId: workspaceIds }) => {
        logger().info({ workspaceIds }, "Pausing workspaces.");
        await Promise.all(
          workspaceIds.map((workspaceId: string) =>
            pauseWorkspace({ workspaceId }),
          ),
        );
        logger().info(
          {
            workspaceIds,
          },
          "Paused workspaces.",
        );
      },
    )
    .command(
      "resume-workspace",
      "Resumes a paused workspace.",
      (cmd) =>
        cmd.options({
          "workspace-id": { type: "string", alias: "w", require: true },
        }),
      ({ workspaceId }) => {
        logger().info({ workspaceId }, "Resuming workspace.");
        resumeWorkspace({ workspaceId });
        logger().info({ workspaceId }, "Resumed workspace.");
      },
    )
    .command(
      "start-compute-properties-global",
      "Starts the global compute properties workflow.",
      (y) => y,
      async () => {
        logger().info("Starting global compute properties workflow.");
        await startComputePropertiesWorkflowGlobal();
        logger().info("Started global compute properties workflow.");
      },
    )
    .command(
      "stop-compute-properties-global",
      "Stops the global compute properties workflow.",
      (y) => y,
      async () => {
        logger().info("Stopping global compute properties workflow.");
        await stopComputePropertiesWorkflowGlobal();
        logger().info("Stopped global compute properties workflow.");
      },
    )
    .command(
      "find-due-workspaces",
      "Find due workspaces.",
      (cmd) =>
        cmd.options({
          interval: { type: "number", alias: "i" },
          limit: { type: "number", alias: "l" },
        }),
      async ({ interval, limit }) => {
        logger().info(
          {
            interval,
            limit,
          },
          "Finding due workspaces.",
        );
        const workspaces = await findDueWorkspaceMaxTos({
          now: new Date().getTime(),
          interval,
          limit,
        });
        logger().info(
          {
            workspaces,
          },
          "Found due workspaces.",
        );
      },
    )
    .command(
      "find-due-workspaces-v2",
      "Find due workspaces.",
      (cmd) =>
        cmd.options({
          interval: { type: "number", alias: "i" },
          limit: { type: "number", alias: "l" },
        }),
      async ({ interval, limit }) => {
        logger().info(
          {
            interval,
            limit,
          },
          "Finding due workspaces.",
        );
        const workspaces = await findDueWorkspaceMinTos({
          now: new Date().getTime(),
          interval,
          limit,
        });
        logger().info(
          {
            workspaces,
          },
          "Found due workspaces.",
        );
      },
    )
    .command(
      "migrate",
      "Run migrations.",
      (y) => y,
      async () => {
        logger().info("Running migrations");
        await publicDrizzleMigrate();
        logger().info("Migrations complete");
      },
    )
    .command(
      "delete-workspace",
      "Delete a workspace by ID or name (only works in development environment).",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            conflicts: "workspace-name",
            describe: "The ID of the workspace to delete.",
          },
          "workspace-name": {
            type: "string",
            conflicts: "workspace-id",
            describe: "The name of the workspace to delete.",
          },
          force: {
            type: "boolean",
            default: false,
            describe: "Force deletion without confirmation.",
          },
        }),
      async ({ workspaceId, workspaceName, force }) => {
        if (backendConfig().nodeEnv !== NodeEnvEnum.Development) {
          logger().error(
            "This command can only be run in development environment.",
          );
          return;
        }

        if (!workspaceId && !workspaceName) {
          logger().error(
            "Either workspace-id or workspace-name must be provided.",
          );
          return;
        }

        let maybeWorkspace: Workspace | undefined;

        if (workspaceId) {
          if (!validateUuid(workspaceId)) {
            logger().error("Invalid workspace ID format.");
            return;
          }

          maybeWorkspace = await db().query.workspace.findFirst({
            where: eq(dbWorkspace.id, workspaceId),
          });
        } else if (workspaceName) {
          maybeWorkspace = await db().query.workspace.findFirst({
            where: eq(dbWorkspace.name, workspaceName),
          });
        } else {
          logger().error(
            "Either workspace-id or workspace-name must be provided.",
          );
          return;
        }

        if (!maybeWorkspace) {
          logger().error("Workspace not found.");
          return;
        }

        // At this point, we know maybeWorkspace is defined
        const workspace = maybeWorkspace;

        if (!force) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question(
              `Are you sure you want to delete workspace "${workspace.name}" (${workspace.id})? This action cannot be undone. [y/N]: `,
              resolve,
            );
          });

          rl.close();

          if (answer.toLowerCase() !== "y") {
            logger().info("Deletion cancelled.");
            return;
          }
        }

        logger().info(
          `Deleting workspace "${workspace.name}" (${workspace.id})...`,
        );

        try {
          await db().transaction(async (tx) => {
            // Delete the workspace from the database
            await tx
              .delete(dbWorkspace)
              .where(eq(dbWorkspace.id, workspace.id));
          });

          // Stop any workflows related to this workspace
          await terminateComputePropertiesWorkflow({
            workspaceId: workspace.id,
          });

          logger().info(
            `Workspace "${workspace.name}" (${workspace.id}) has been deleted.`,
          );
        } catch (error) {
          logger().error({ error }, "Failed to delete workspace.");
        }
      },
    )
    .command(
      "delete-all-users",
      "Delete all users from a workspace (only works in development environment).",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            describe: "The ID of the workspace to delete all users from.",
          },
          force: {
            type: "boolean",
            default: false,
            describe: "Force deletion without confirmation.",
          },
        }),
      async ({ workspaceId, force }) => {
        let maybeWorkspace: Workspace | undefined;
        if (!workspaceId) {
          if (backendConfig().nodeEnv !== NodeEnvEnum.Development) {
            logger().error(
              "This command can only be run without a workspace ID in development environment.",
            );
            return;
          }
          maybeWorkspace = await db().query.workspace.findFirst();
        } else {
          if (!validateUuid(workspaceId)) {
            logger().error("Invalid workspace ID format.");
            return;
          }

          maybeWorkspace = await db().query.workspace.findFirst({
            where: eq(dbWorkspace.id, workspaceId),
          });
        }
        if (!maybeWorkspace) {
          logger().error("Workspace not found.");
          return;
        }

        const workspace = maybeWorkspace;
        if (!force) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question(
              `WARNING: This will delete ALL users from workspace "${workspace.name}" (${workspace.id}).\nThis action cannot be undone. Are you sure? [y/N]: `,
              resolve,
            );
          });

          rl.close();

          if (answer.toLowerCase() !== "y") {
            logger().info("Deletion cancelled.");
            return;
          }
        }

        logger().info(
          {
            workspaceId: workspace.id,
            workspaceName: workspace.name,
          },
          `Deleting all users from workspace`,
        );

        try {
          await deleteAllUsers({ workspaceId: workspace.id });
          logger().info(
            {
              workspaceId: workspace.id,
              workspaceName: workspace.name,
            },
            `All users have been deleted from workspace`,
          );
        } catch (err) {
          logger().error({ err }, "Failed to delete all users.");
        }
      },
    )
    .command(
      "get-queue-state",
      "Retrieves the current state of the compute properties queue workflow.",
      (cmd) => cmd, // No specific options needed for now
      async () => {
        logger().info("Getting compute properties queue state");
        const client = await connectWorkflowClient();

        logger().info(
          {
            workflowId: COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
          },
          "Querying workflow",
        );

        const handle = client.getHandle(COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID);
        const state = await handle.query(getQueueStateQuery);

        logger().info(
          {
            queueSize: state.priorityQueue.length,
            membershipSize: state.membership.length,
            inFlightCount: state.inFlightTaskIds.length,
            totalProcessed: state.totalProcessed,
            inFlightTaskIdsSample: state.inFlightTaskIds,
            priorityQueueSample: state.priorityQueue,
          },
          "Current compute properties queue state",
        );
      },
    )
    .command(
      "submit-track-events",
      "Execute a custom SQL query against ClickHouse and resubmit the track events back to the table, potentially re-triggering journeys",
      (cmd) =>
        cmd.options({
          sql: {
            type: "string",
            alias: "s",
            require: true,
            describe: "The SQL query to execute against ClickHouse",
          },
        }),
      async ({ sql }) => {
        logger().info(
          {
            sql,
          },
          "Executing custom SQL query and resubmitting events",
        );

        // Execute the custom SQL query
        const resultSet = await clickhouseClient().query({
          query: sql,
          format: "JSONEachRow",
        });

        const results = await resultSet.json<unknown>();

        logger().info(
          {
            eventCount: results.length,
          },
          "Found events, preparing to resubmit",
        );

        const validationResult = schemaValidateWithErr(
          results,
          Type.Array(
            Type.Composite([
              Type.Omit(UserEvent, [
                "message_id",
                "message_raw",
                "processing_time",
                "anonymous_id",
                "user_or_anonymous_id",
              ]),
              Type.Object({
                properties: Type.Optional(Type.String()),
                context: Type.Optional(Type.String()),
              }),
            ]),
          ),
        );
        if (validationResult.isErr()) {
          logger().error({ err: validationResult.error }, "Invalid events");
          return;
        }
        if (results.length === 0) {
          logger().info("No events found for the given query");
          return;
        }

        const trackEvents: (KnownTrackData & { workspaceId: string })[] =
          validationResult.value.flatMap((event) => {
            if (event.event_type !== EventType.Track) {
              logger().info(
                { event },
                "Skipping event because it is not a track event",
              );
              return [];
            }
            if (!event.user_id) {
              logger().info(
                { event },
                "Skipping event because it does not have a user id",
              );
              return [];
            }
            return {
              workspaceId: event.workspace_id,
              event: event.event,
              userId: event.user_id,
              messageId: randomUUID(),
              timestamp: event.event_time,
              context: event.context ? JSON.parse(event.context) : undefined,
              properties: event.properties
                ? JSON.parse(event.properties)
                : undefined,
            };
          });
        await Promise.all(
          trackEvents.map(({ workspaceId, ...event }) =>
            submitTrackWithTriggers({
              workspaceId,
              data: event,
            }),
          ),
        );
        logger().info("Done.");
      },
    )
    .command(
      "export-user-events",
      "Copy user events from a source to a destination ClickHouse instance.",
      (cmd) =>
        cmd.options({
          "source-clickhouse-host": { type: "string", demandOption: true },
          "source-clickhouse-port": { type: "number" },
          "source-clickhouse-database": { type: "string", demandOption: true },
          "source-clickhouse-user": { type: "string", demandOption: true },
          "source-clickhouse-password": { type: "string", demandOption: true },
          "destination-clickhouse-host": { type: "string", demandOption: true },
          "destination-clickhouse-port": { type: "number" },
          "destination-clickhouse-database": {
            type: "string",
            demandOption: true,
          },
          "destination-clickhouse-user": { type: "string", demandOption: true },
          "destination-clickhouse-password": {
            type: "string",
            demandOption: true,
          },
          "batch-size": { type: "number", default: 1000 },
        }),
      async ({
        sourceClickhouseHost,
        sourceClickhousePort,
        sourceClickhouseDatabase,
        sourceClickhouseUser,
        sourceClickhousePassword,
        destinationClickhouseHost,
        destinationClickhousePort,
        destinationClickhouseDatabase,
        destinationClickhouseUser,
        destinationClickhousePassword,
        batchSize,
      }) => {
        const sourceClient = createClickhouseClient({
          host: sourceClickhousePort
            ? `http://${sourceClickhouseHost}:${sourceClickhousePort}`
            : sourceClickhouseHost,
          database: sourceClickhouseDatabase,
          user: sourceClickhouseUser,
          password: sourceClickhousePassword,
        });

        const destinationClient = createClickhouseClient({
          host: destinationClickhousePort
            ? `http://${destinationClickhouseHost}:${destinationClickhousePort}`
            : destinationClickhouseHost,
          database: destinationClickhouseDatabase,
          user: destinationClickhouseUser,
          password: destinationClickhousePassword,
        });

        let cursor: UserEventV2 | null = null;
        let totalCopied = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          let queryText: string;
          const queryParams: Record<string, unknown> = {
            batchSize,
          };

          if (cursor) {
            logger().info(
              {
                cursor,
                batchSize,
              },
              "Fetching events from cursor",
            );
            queryText = `
              SELECT *
              FROM user_events_v2
              WHERE (workspace_id, processing_time, user_or_anonymous_id, event_time, message_id) > ({workspace_id:String}, {processing_time:DateTime64(3)}, {user_or_anonymous_id:String}, {event_time:DateTime64}, {message_id:String})
              ORDER BY workspace_id, processing_time, user_or_anonymous_id, event_time, message_id
              LIMIT {batchSize:UInt64}
            `;
            queryParams.workspace_id = cursor.workspace_id;
            queryParams.processing_time = cursor.processing_time;
            queryParams.user_or_anonymous_id = cursor.user_or_anonymous_id;
            queryParams.event_time = cursor.event_time;
            queryParams.message_id = cursor.message_id;
          } else {
            logger().info(
              {
                batchSize,
              },
              "Fetching initial batch of events",
            );
            queryText = `
              SELECT *
              FROM user_events_v2
              ORDER BY workspace_id, processing_time, user_or_anonymous_id, event_time, message_id
              LIMIT {batchSize:UInt64}
            `;
          }

          const resultSet = await sourceClient.query({
            query: queryText,
            query_params: queryParams,
            format: "JSONEachRow",
          });

          const events = await resultSet.json<UserEventV2>();

          if (events.length === 0) {
            logger().info("No more events to copy.");
            break;
          }

          logger().info(
            {
              eventsLength: events.length,
            },
            "Inserting events",
          );

          await destinationClient.insert({
            table: "user_events_v2",
            values: events,
            format: "JSONEachRow",
          });

          const lastEvent = events[events.length - 1];
          if (lastEvent) {
            cursor = lastEvent;
          }

          totalCopied += events.length;

          logger().info(
            {
              eventsLength: events.length,
              totalCopied,
            },
            "Copied events",
          );
        }

        logger().info("Event export completed successfully.");
        await sourceClient.close();
        await destinationClient.close();
      },
    )
    .command(
      "keyed-user-journey-workflow-id",
      "Generate a keyed user journey workflow ID.",
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            demandOption: true,
            describe: "The workspace ID",
          },
          "user-id": {
            type: "string",
            alias: "u",
            demandOption: true,
            describe: "The user ID",
          },
          "journey-id": {
            type: "string",
            alias: "j",
            demandOption: true,
            describe: "The journey ID",
          },
          "event-key": {
            type: "string",
            alias: "k",
            demandOption: true,
            describe: "The event key",
          },
          "event-key-value": {
            type: "string",
            alias: "v",
            demandOption: true,
            describe: "The event key value",
          },
        }),
      async ({ workspaceId, userId, journeyId, eventKey, eventKeyValue }) => {
        const workflowId = getKeyedUserJourneyWorkflowIdInner({
          workspaceId,
          userId,
          journeyId,
          eventKey,
          eventKeyValue,
        });
        logger().info(
          { workflowId },
          "Generated keyed user journey workflow ID",
        );
      },
    )
    .command(
      "get-users",
      "Get users from a workspace.",
      (cmd) =>
        cmd.options({
          "workspace-id": { type: "string", demandOption: true },
          "user-ids": { type: "string", array: true },
          limit: { type: "number", default: 100 },
          cursor: { type: "string" },
          "throw-on-error": { type: "boolean", default: false },
        }),
      async ({ workspaceId, throwOnError, limit, cursor, userIds }) => {
        logger().info(
          {
            workspaceId,
          },
          "Getting users",
        );
        const users = await getUsers(
          { workspaceId, cursor, limit, userIds },
          { throwOnError },
        );
        logger().info(users, "Users");
      },
    )
    .command(
      "generate-events-search-query",
      "Generate optimized events search query for performance testing.",
      (cmd) =>
        cmd.options({
          "workspace-id": { type: "string", alias: "w", demandOption: true },
          "journey-id": { type: "string", alias: "j" },
          "broadcast-id": { type: "string", alias: "b" },
          "event-type": { type: "string", alias: "et" },
          event: { type: "string", alias: "e", array: true },
          "user-id": { type: "string", alias: "u" },
          "start-date": { type: "string", alias: "s" },
          "end-date": { type: "string", alias: "ed" },
          limit: { type: "number", alias: "l", default: 100 },
          "message-id": { type: "string", alias: "m", array: true },
          offset: { type: "number", alias: "o", default: 0 },
        }),
      async ({
        workspaceId,
        journeyId,
        broadcastId,
        eventType,
        event,
        userId,
        startDate,
        endDate,
        limit,
        offset,
        messageId,
      }) => {
        const debugQb = new ClickHouseQueryBuilder({ debug: true });
        const { query } = await buildUserEventsQuery(
          {
            workspaceId,
            limit,
            offset,
            journeyId,
            broadcastId,
            eventType,
            event,
            messageId,
            userId,
            startDate: startDate ? new Date(startDate).getTime() : undefined,
            endDate: endDate ? new Date(endDate).getTime() : undefined,
          },
          debugQb,
        );

        const productionQuery = query
          .replace(/user_events_v2/g, "dittofeed.user_events_v2")
          .replace(/internal_events/g, "dittofeed.internal_events");

        logger().info(
          `Generated optimized events search query:\n${productionQuery}`,
        );
      },
    )
    .command(
      "generate-deliveries-search-query",
      "Generate optimized deliveries search query for performance testing.",
      (cmd) =>
        cmd.options({
          "workspace-id": { type: "string", alias: "w", demandOption: true },
          "journey-id": { type: "string", alias: "j" },
          "broadcast-id": { type: "string", alias: "b" },
          "template-ids": { type: "string", alias: "t", array: true },
          channels: {
            type: "string",
            alias: "c",
            array: true,
            choices: ["Email", "MobilePush", "Sms", "Webhook"],
          },
          "user-id": { type: "string", alias: "u", array: true },
          to: { type: "string", array: true },
          from: { type: "string", array: true },
          statuses: { type: "string", alias: "s", array: true },
          "start-date": { type: "string", alias: "sd" },
          "end-date": { type: "string", alias: "ed" },
          "group-id": { type: "string", alias: "g", array: true },
          "sort-by": {
            type: "string",
            choices: ["sentAt", "status", "from", "to"],
            default: "sentAt",
          },
          "sort-direction": {
            type: "string",
            choices: ["Asc", "Desc"],
            default: "Desc",
          },
          limit: { type: "number", alias: "l", default: 20 },
          cursor: { type: "string" },
        }),
      async ({
        workspaceId,
        journeyId,
        broadcastId,
        templateIds,
        channels,
        userId,
        to,
        from,
        statuses,
        startDate,
        endDate,
        groupId,
        sortBy,
        sortDirection,
        limit,
        cursor,
      }) => {
        const debugQb = new ClickHouseQueryBuilder({ debug: true });
        const { query } = await buildDeliverySearchQuery(
          {
            workspaceId,
            journeyId,
            broadcastId,
            templateIds,
            channels: channels as
              | ("Email" | "MobilePush" | "Sms" | "Webhook")[]
              | undefined,
            userId,
            to,
            from,
            statuses,
            startDate,
            endDate,
            groupId,
            sortBy: sortBy as "from" | "to" | "sentAt" | "status" | undefined,
            sortDirection: sortDirection as "Asc" | "Desc" | undefined,
            limit,
            cursor,
          },
          debugQb,
        );

        const productionQuery = query
          .replace(/user_events_v2/g, "dittofeed.user_events_v2")
          .replace(/internal_events/g, "dittofeed.internal_events")
          .replace(
            /group_user_assignments/g,
            "dittofeed.group_user_assignments",
          );

        logger().info(
          `Generated optimized deliveries search query:\n${productionQuery}`,
        );
      },
    )
    .command(
      "seed-delivery-events",
      "Seed delivery events for testing analysis charts.",
      (cmd) =>
        cmd.options({
          "workspace-id": { type: "string", alias: "w", demandOption: false },
          scenario: {
            type: "string",
            alias: "s",
            default: "basic-email",
            choices: ["basic-email"],
            describe: "The scenario to seed",
          },
        }),
      async ({ workspaceId: inputWorkspaceId, scenario }) => {
        // Resolve workspace ID
        let workspaceId = inputWorkspaceId;
        if (!workspaceId) {
          if (backendConfig().nodeEnv !== NodeEnvEnum.Development) {
            throw new Error(
              "workspace-id is required in non-development environments",
            );
          }

          const defaultWorkspace = await db().query.workspace.findFirst({
            where: eq(schema.workspace.name, "Default"),
          });

          if (!defaultWorkspace) {
            throw new Error(
              "No workspace with name 'Default' found in development environment",
            );
          }

          workspaceId = defaultWorkspace.id;
          logger().info(
            { workspaceId },
            "Using Default workspace for development",
          );
        }

        logger().info(
          {
            workspaceId,
            scenario,
          },
          "Seeding delivery events",
        );

        switch (scenario) {
          case "basic-email": {
            const templateId = randomUUID();
            const journeyId = randomUUID();
            const nodeId = randomUUID();
            const runId = randomUUID();
            const baseTime = Date.now();

            // Create 10 users
            const userIds = Array.from({ length: 10 }, () => randomUUID());
            const events: BatchItem[] = [];

            // Create 10 message sent events - one for each user
            userIds.forEach((userId, index) => {
              const messageId = randomUUID();
              const userEmail = `user${index + 1}@example.com`;

              events.push({
                userId,
                timestamp: new Date(
                  baseTime - (10 - index) * 30000,
                ).toISOString(), // 30 seconds apart
                type: EventType.Track,
                messageId,
                event: InternalEventType.MessageSent,
                properties: {
                  workspaceId,
                  journeyId,
                  nodeId,
                  runId,
                  templateId,
                  messageId,
                  variant: {
                    type: ChannelType.Email,
                    from: "system@example.com",
                    to: userEmail,
                    subject: `Welcome Message`,
                    body: `<h1>Welcome!</h1><p>This is your welcome message</p>`,
                    provider: {
                      type: EmailProviderType.SendGrid,
                    },
                  },
                },
              });
            });

            // User 0: spam report
            const user0 = userIds[0];
            if (user0) {
              events.push({
                userId: user0,
                timestamp: new Date(baseTime - 9 * 30000 + 60000).toISOString(), // 1 minute after send
                type: EventType.Track,
                messageId: randomUUID(),
                event: InternalEventType.EmailMarkedSpam,
                properties: {
                  workspaceId,
                  journeyId,
                  nodeId,
                  runId,
                  templateId,
                  messageId: events[0]?.messageId, // Reference the sent message
                },
              });
            }

            // User 1: bounce
            const user1 = userIds[1];
            if (user1) {
              events.push({
                userId: user1,
                timestamp: new Date(baseTime - 8 * 30000 + 15000).toISOString(), // 15 seconds after send
                type: EventType.Track,
                messageId: randomUUID(),
                event: InternalEventType.EmailBounced,
                properties: {
                  workspaceId,
                  journeyId,
                  nodeId,
                  runId,
                  templateId,
                  messageId: events[1]?.messageId, // Reference the sent message
                  reason: "hard_bounce",
                },
              });
            }

            // Users 2, 3, 4: delivered and open but no click
            for (let i = 2; i <= 4; i++) {
              const userId = userIds[i];
              if (userId) {
                // Delivery event first
                events.push({
                  userId,
                  timestamp: new Date(
                    baseTime - (10 - i) * 30000 + 30000,
                  ).toISOString(), // 30 seconds after send
                  type: EventType.Track,
                  messageId: randomUUID(),
                  event: InternalEventType.EmailDelivered,
                  properties: {
                    workspaceId,
                    journeyId,
                    nodeId,
                    runId,
                    templateId,
                    messageId: events[i]?.messageId, // Reference the sent message
                  },
                });

                // Open event
                events.push({
                  userId,
                  timestamp: new Date(
                    baseTime - (10 - i) * 30000 + 45000,
                  ).toISOString(), // 45 seconds after send
                  type: EventType.Track,
                  messageId: randomUUID(),
                  event: InternalEventType.EmailOpened,
                  properties: {
                    workspaceId,
                    journeyId,
                    nodeId,
                    runId,
                    templateId,
                    messageId: events[i]?.messageId, // Reference the sent message
                  },
                });
              }
            }

            // Users 5, 6: delivered, open and click
            for (let i = 5; i <= 6; i++) {
              const userId = userIds[i];
              if (userId) {
                // Delivery event first
                events.push({
                  userId,
                  timestamp: new Date(
                    baseTime - (10 - i) * 30000 + 30000,
                  ).toISOString(), // 30 seconds after send
                  type: EventType.Track,
                  messageId: randomUUID(),
                  event: InternalEventType.EmailDelivered,
                  properties: {
                    workspaceId,
                    journeyId,
                    nodeId,
                    runId,
                    templateId,
                    messageId: events[i]?.messageId, // Reference the sent message
                  },
                });

                // Open event
                events.push({
                  userId,
                  timestamp: new Date(
                    baseTime - (10 - i) * 30000 + 45000,
                  ).toISOString(), // 45 seconds after send
                  type: EventType.Track,
                  messageId: randomUUID(),
                  event: InternalEventType.EmailOpened,
                  properties: {
                    workspaceId,
                    journeyId,
                    nodeId,
                    runId,
                    templateId,
                    messageId: events[i]?.messageId, // Reference the sent message
                  },
                });

                // Click event
                events.push({
                  userId,
                  timestamp: new Date(
                    baseTime - (10 - i) * 30000 + 90000,
                  ).toISOString(), // 90 seconds after send
                  type: EventType.Track,
                  messageId: randomUUID(),
                  event: InternalEventType.EmailClicked,
                  properties: {
                    workspaceId,
                    journeyId,
                    nodeId,
                    runId,
                    templateId,
                    messageId: events[i]?.messageId, // Reference the sent message
                    link: "https://example.com/clicked-link",
                  },
                });
              }
            }

            // Users 7, 8, 9: no additional events beyond send

            logger().info(
              {
                eventsCount: events.length,
                userCount: userIds.length,
                journeyId,
                templateId,
                breakdown: {
                  sent: 10,
                  delivered: 5, // Users 2,3,4,5,6 have delivery events
                  spam: 1,
                  bounce: 1,
                  openOnly: 3, // Users 2,3,4 have open (and delivery) but no click
                  openAndClick: 2, // Users 5,6 have open, click (and delivery)
                  sentOnly: 3, // Users 7,8,9 have only sent events
                },
              },
              "Created events for basic-email scenario",
            );

            // Submit events individually with specific processing times to spread them across time buckets
            for (const event of events) {
              const eventTimestamp = event.timestamp
                ? new Date(event.timestamp).getTime()
                : undefined;
              await submitBatch(
                {
                  workspaceId,
                  data: {
                    batch: [event],
                  },
                },
                {
                  processingTime: eventTimestamp,
                },
              );
            }

            logger().info("Successfully seeded delivery events");
            break;
          }
          default:
            throw new Error(`Unknown scenario: ${scenario}`);
        }
      },
    );
}
