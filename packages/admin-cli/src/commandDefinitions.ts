import { Type } from "@sinclair/typebox";
import { createAdminApiKey } from "backend-lib/src/adminApiKeys";
import { bootstrapClickhouse } from "backend-lib/src/bootstrap";
import { computeState } from "backend-lib/src/computedProperties/computePropertiesIncremental";
import {
  COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
  getQueueStateQuery,
} from "backend-lib/src/computedProperties/computePropertiesQueueWorkflow";
import {
  resetComputePropertiesWorkflow,
  resetGlobalCron,
  startComputePropertiesWorkflow,
  startComputePropertiesWorkflowGlobal,
  stopComputePropertiesWorkflow,
  stopComputePropertiesWorkflowGlobal,
  terminateComputePropertiesWorkflow,
} from "backend-lib/src/computedProperties/computePropertiesWorkflow/lifecycle";
import {
  findDueWorkspaceMaxTos,
  findDueWorkspaceMinTos,
} from "backend-lib/src/computedProperties/periods";
import backendConfig, { SECRETS } from "backend-lib/src/config";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { workspace as dbWorkspace } from "backend-lib/src/db/schema";
import { findBaseDir } from "backend-lib/src/dir";
import { addFeatures, removeFeatures } from "backend-lib/src/features";
import logger from "backend-lib/src/logger";
import { publicDrizzleMigrate } from "backend-lib/src/migrate";
import { onboardUser } from "backend-lib/src/onboarding";
import { findManySegmentResourcesSafe } from "backend-lib/src/segments";
import connectWorkflowClient from "backend-lib/src/temporal/connectWorkflowClient";
import { transferResources } from "backend-lib/src/transferResources";
import { NodeEnvEnum, Workspace } from "backend-lib/src/types";
import { findAllUserPropertyResources } from "backend-lib/src/userProperties";
import { deleteAllUsers } from "backend-lib/src/users";
import {
  activateTombstonedWorkspace,
  pauseWorkspace,
  resumeWorkspace,
  tombstoneWorkspace,
} from "backend-lib/src/workspaces";
import { randomUUID } from "crypto";
import { and, eq, inArray, SQL } from "drizzle-orm";
import fs from "fs/promises";
import { SecretNames } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  jsonParseSafeWithSchema,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  ChannelType,
  EmailProviderType,
  FeatureName,
  FeatureNamesEnum,
  Features,
  MessageTemplateResourceDefinition,
  SendgridSecret,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
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
  disentangleResendSendgrid,
  upgradeV010Post,
  upgradeV010Pre,
  upgradeV012Pre,
  upgradeV021Pre,
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
        let condition: SQL | undefined;
        if (!all && workspaceId) {
          const workspaceIds = workspaceId.split(",");
          condition = inArray(schema.workspace.id, workspaceIds);
        }
        const workspaces = await db().query.workspace.findMany({
          where: condition,
          with: {
            features: true,
          },
        });
        logger().info(
          {
            queue: backendConfig().computedPropertiesTaskQueue,
          },
          "Resetting computed properties workflows",
        );
        await Promise.all(
          workspaces.map(async (workspace) => {
            const isGlobal = workspace.features.some(
              (f) =>
                // defaults to true
                backendConfig().useGlobalComputedProperties !== false ||
                // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
                (f.name === FeatureNamesEnum.ComputePropertiesGlobal &&
                  f.enabled),
            );
            if (
              workspace.status !== WorkspaceStatusDbEnum.Active ||
              workspace.type === WorkspaceTypeAppEnum.Parent ||
              isGlobal
            ) {
              await terminateComputePropertiesWorkflow({
                workspaceId: workspace.id,
              });
              logger().info(
                {
                  workspaceId: workspace.id,
                  type: workspace.type,
                  status: workspace.status,
                  isGlobal,
                },
                "Terminated computed properties workflow",
              );
            } else {
              await resetComputePropertiesWorkflow({
                workspaceId: workspace.id,
              });
              logger().info(
                {
                  workspaceId: workspace.id,
                  type: workspace.type,
                  status: workspace.status,
                },
                "Reset computed properties workflow",
              );
            }
          }),
        );
        logger().info("Done.");
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
            require: true,
            describe: "The ID of the workspace to delete all users from.",
          },
          force: {
            type: "boolean",
            default: false,
            describe: "Force deletion without confirmation.",
          },
        }),
      async ({ workspaceId, force }) => {
        if (backendConfig().nodeEnv !== NodeEnvEnum.Development) {
          logger().error(
            "This command can only be run in development environment.",
          );
          return;
        }

        if (!validateUuid(workspaceId)) {
          logger().error("Invalid workspace ID format.");
          return;
        }

        const workspace = await db().query.workspace.findFirst({
          where: eq(dbWorkspace.id, workspaceId),
        });

        if (!workspace) {
          logger().error("Workspace not found.");
          return;
        }

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
          `Deleting all users from workspace "${workspace.name}" (${workspace.id})...`,
        );

        try {
          await deleteAllUsers({ workspaceId });
          logger().info(
            `All users have been deleted from workspace "${workspace.name}" (${workspace.id}).`,
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
    );
}
