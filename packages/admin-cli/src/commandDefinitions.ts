import { Type } from "@sinclair/typebox";
import { createAdminApiKey } from "backend-lib/src/adminApiKeys";
import { computeState } from "backend-lib/src/computedProperties/computePropertiesIncremental";
import {
  resetComputePropertiesWorkflow,
  resetGlobalCron,
  startComputePropertiesWorkflow,
  startComputePropertiesWorkflowGlobal,
  stopComputePropertiesWorkflow,
  stopComputePropertiesWorkflowGlobal,
  terminateComputePropertiesWorkflow,
} from "backend-lib/src/computedProperties/computePropertiesWorkflow/lifecycle";
import { findDueWorkspaceMaxTos } from "backend-lib/src/computedProperties/periods";
import backendConfig from "backend-lib/src/config";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { findBaseDir } from "backend-lib/src/dir";
import { addFeatures, removeFeatures } from "backend-lib/src/features";
import logger from "backend-lib/src/logger";
import { publicDrizzleMigrate } from "backend-lib/src/migrate";
import { onboardUser } from "backend-lib/src/onboarding";
import { findManySegmentResourcesSafe } from "backend-lib/src/segments";
import { transferResources } from "backend-lib/src/transferResources";
import { findAllUserPropertyResources } from "backend-lib/src/userProperties";
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

import { boostrapOptions, bootstrapHandler } from "./bootstrap";
import { hubspotSync } from "./hubspot";
import { resetWorkspaceData } from "./reset";
import { spawnWithEnv } from "./spawn";
import { CommandDefinition } from "./types";
import {
  disentangleResendSendgrid,
  upgradeV010Post,
  upgradeV010Pre,
  upgradeV012Pre,
} from "./upgrades";

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  {
    command: "bootstrap",
    description:
      "Initialize the dittofeed application and creates a workspace.",
    builder: boostrapOptions,
    handler: bootstrapHandler,
  },
  {
    command: "bootstrap-worker",
    description: "Bootstrap worker.",
    builder: (cmd) =>
      cmd.options({
        "workspace-id": {
          type: "string",
          alias: "w",
          require: true,
          describe: "The workspace id to bootstrap.",
        },
      }),
    handler: ({ workspaceId }) =>
      startComputePropertiesWorkflow({ workspaceId }),
  },
  {
    command: "spawn",
    description:
      "Spawns a shell command, with dittofeed's config exported as environment variables.",
    handler: () => spawnWithEnv(process.argv.slice(3)),
  },
  {
    command: "prisma",
    description:
      "Spawns prisma with dittofeed's config exported as environment variables.",
    handler: () =>
      spawnWithEnv(
        ["yarn", "workspace", "backend-lib", "prisma"].concat(
          process.argv.slice(3),
        ),
      ),
  },
  {
    command: "psql",
    description: "Spawns psql with dittofeed's config used to authenticate.",
    handler: () => spawnWithEnv(["psql", backendConfig().databaseUrl]),
  },
  {
    command: "psql-exec",
    description:
      "Executes a psql command with dittofeed's config used to authenticate.",
    builder: (cmd) =>
      cmd.options({
        command: { type: "string", alias: "c", require: true },
      }),
    handler: ({ command }) =>
      spawnWithEnv(["psql", backendConfig().databaseUrl, "-c", command]),
  },
  {
    command: "clickhouse-client",
    description:
      "Spawns clickhouse-client with dittofeed's config used to authenticate.",
    handler: async () => {
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
  },
  {
    command: "clickhouse client",
    description:
      "Spawns 'clickhouse client' with dittofeed's config used to authenticate. Useful for local development for users that installed both clickhouse server and client.",
    handler: async () => {
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
  },
  {
    command: "onboard-user",
    description: "Onboards a user to a workspace.",
    builder: (cmd) =>
      cmd.options({
        email: { type: "string", demandOption: true },
        "workspace-name": { type: "string", demandOption: true },
      }),
    handler: async function handler({
      workspaceName,
      email,
    }: {
      workspaceName: string;
      email: string;
    }) {
      const onboardUserResult = await onboardUser({ workspaceName, email });
      unwrap(onboardUserResult);
    },
  },
  {
    command: "hubspot-sync",
    description: "Syncs fake user info to hubspot.",
    builder: (cmd) =>
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
          describe: "Whether to update the email record. Defaults to creating.",
        },
      }),
    handler: ({ workspaceId, email, from, updateEmail }) =>
      hubspotSync({ workspaceId, email, from, updateEmail }),
  },
  {
    command: "reset-compute-properties",
    description: "Resets compute properties workflow.",
    builder: (cmd) =>
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
    handler: async ({ workspaceId, all }) => {
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
              // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
              f.name === FeatureNamesEnum.ComputePropertiesGlobal && f.enabled,
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
  },
  {
    command: "stop-compute-properties",
    description: "Stops compute properties workflow.",
    builder: (cmd) =>
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
    handler: async ({ workspaceId }) => {
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
  },
  {
    command: "terminate-compute-properties",
    description: "Terminates compute properties workflow.",
    builder: (cmd) =>
      cmd.options({
        "workspace-id": { type: "string", alias: "w", require: true },
      }),
    handler: async ({ workspaceId }) => {
      await terminateComputePropertiesWorkflow({ workspaceId });
      logger().info("Done.");
    },
  },
  {
    command: "reset-global-cron",
    description: "Resets global cron job.",
    handler: async () => {
      await resetGlobalCron();
      logger().info("Done.");
    },
  },
  {
    command: "config-print",
    description: "Prints the backend config used by dittofeed aplications.",
    handler: () => {
      logger().info(backendConfig(), "Backend Config");
    },
  },
  {
    command: "migrations email-provider-secret",
    description:
      "Runs migrations, copying api keys on email providers to the secrets table.",
    handler: async () => {
      await db().transaction(async (pTx) => {
        const emailProviders = await pTx.query.emailProvider.findMany();
        await Promise.all(
          emailProviders.map(async (emailProvider) => {
            const webhookSecret = await pTx.query.secret.findFirst({
              where: and(
                eq(schema.secret.workspaceId, emailProvider.workspaceId),
                eq(schema.secret.name, SecretNames.Sendgrid),
              ),
            });
            const sendgridSecretDefinition: SendgridSecret = {
              apiKey: emailProvider.apiKey ?? undefined,
              webhookKey: webhookSecret?.value ?? undefined,
              type: EmailProviderType.Sendgrid,
            };
            const [secret] = await pTx
              .insert(schema.secret)
              .values({
                id: randomUUID(),
                workspaceId: emailProvider.workspaceId,
                name: SecretNames.Sendgrid,
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
  },
  {
    command: "migrations disentangle-resend-sendgrid",
    description:
      "Runs migration, disentangling the resend and sendgrid email providers.",
    handler: () => disentangleResendSendgrid(),
  },
  {
    command: "admin-api-key create",
    description: "Creates an admin API key in the relevant workspace.",
    builder: (cmd) =>
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
    handler: async ({ workspaceId, name }) => {
      const result = await createAdminApiKey({ workspaceId, name });
      if (result.isErr()) {
        logger().error(result.error, "Failed to create admin API key");
        return;
      }
      logger().info(result.value, "Created admin API Key");
    },
  },
  {
    command: "compute-state",
    description:
      "Manually re-run the computeState step of the compute properties workflow.",
    builder: (cmd) =>
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
    handler: async ({ workspaceId, endDate }) => {
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
  },
  {
    command: "export-templates",
    description: "Export zip file with templates.",
    handler: async () => {
      logger().info("Exporting templates...");
      const baseDir = findBaseDir();
      const tmpDir = path.join(baseDir, ".tmp", `templates-${Date.now()}`);
      const workspaces = await db().query.workspace.findMany();
      const promises: Promise<string>[] = workspaces.map(async (workspace) => {
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
      });
      await Promise.all(promises);
      logger().info(
        {
          dir: tmpDir,
        },
        "Finished exporting templates.",
      );
    },
  },
  {
    command: "upgrade-0-10-0-pre",
    description:
      "Run the pre-upgrade steps for the 0.10.0 prior to updating your Dittofeed application version.",
    handler: async () => {
      await upgradeV010Pre();
    },
  },
  {
    command: "upgrade-0-10-0-post",
    description:
      "Run the post-upgrade steps for the 0.10.0 after updating your Dittofeed application version.",
    handler: async () => {
      await upgradeV010Post();
    },
  },
  {
    command: "upgrade-0-12-1-pre",
    description:
      "Run the post-upgrade steps for the 0.10.0 after updating your Dittofeed application version.",
    handler: async () => {
      await upgradeV012Pre();
    },
  },
  {
    command: "transfer-resources",
    description: "Transfer resources from one workspace to another.",
    builder: (cmd) =>
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
    handler: async ({ workspaceId, destinationWorkspaceId }) => {
      await transferResources({ workspaceId, destinationWorkspaceId });
    },
  },
  {
    command: "reset-workspace-data",
    description: "Resets workspace data. Leaves resources intact.",
    builder: (cmd) =>
      cmd.options({
        "workspace-id": {
          type: "string",
          alias: "w",
          require: true,
        },
      }),
    handler: ({ workspaceId }) => resetWorkspaceData({ workspaceId }),
  },
  {
    command: "activate-tombstoned-workspace",
    description: "Activates a tombstoned workspace.",
    builder: (cmd) =>
      cmd.options({
        "workspace-id": { type: "string", alias: "w", require: true },
      }),
    handler: async ({ workspaceId }) => {
      const result = await activateTombstonedWorkspace(workspaceId);
      if (result.isErr()) {
        logger().error(result.error, "Failed to activate tombstoned workspace");
        return;
      }
      logger().info("Activated tombstoned workspace.");
    },
  },
  {
    command: "tombstone-workspace",
    description: "Tombstones a workspace.",
    builder: (cmd) =>
      cmd.options({
        "workspace-id": { type: "string", alias: "w", require: true },
      }),
    handler: async ({ workspaceId }) => {
      const result = await tombstoneWorkspace(workspaceId);
      if (result.isErr()) {
        logger().error(result.error, "Failed to tombstone workspace");
        return;
      }
      logger().info("Tombstoned workspace.");
    },
  },
  {
    command: "create-admin-api-key",
    description: "Creates an admin API key.",
    builder: (cmd) =>
      cmd.options({
        "workspace-name": { type: "string", alias: "w", require: true },
        name: { type: "string", alias: "n", require: true },
      }),
    handler: async ({ workspaceName, name }) => {
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
  },
  {
    command: "add-features",
    description: "Adds features to a workspace.",
    builder: (cmd) =>
      cmd.options({
        "workspace-id": {
          type: "string",
          alias: "w",
          require: true,
          array: true,
        },
        features: { type: "string", alias: "f", require: true },
      }),
    handler: async ({ workspaceId, features: featuresString }) => {
      const features = jsonParseSafeWithSchema(featuresString, Features, {
        method: "standard",
      });
      if (features.isErr()) {
        logger().error(features.error, "Failed to parse features");
        return;
      }
      logger().info({ features, workspaceId }, "Adding features to workspace.");
      await addFeatures({ workspaceId, features: features.value });
      logger().info("Added features to workspace.");
    },
  },
  {
    command: "remove-features",
    description: "Removes features from a workspace.",
    builder: (cmd) =>
      cmd.options({
        "workspace-id": {
          type: "string",
          alias: "w",
          require: true,
          array: true,
        },
        features: { type: "string", alias: "f", require: true, array: true },
      }),
    handler: async ({ workspaceId, features: unvalidatedFeatures }) => {
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
  },
  {
    command: "pause-workspace",
    description: "Pauses a workspace.",
    builder: (cmd) =>
      cmd.options({
        "workspace-id": {
          type: "string",
          alias: "w",
          require: true,
          array: true,
        },
      }),
    handler: async ({ workspaceId: workspaceIds }) => {
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
  },
  {
    command: "resume-workspace",
    description: "Resumes a paused workspace.",
    builder: (cmd) =>
      cmd.options({
        "workspace-id": { type: "string", alias: "w", require: true },
      }),
    handler: ({ workspaceId }) => {
      logger().info({ workspaceId }, "Resuming workspace.");
      resumeWorkspace({ workspaceId });
      logger().info({ workspaceId }, "Resumed workspace.");
    },
  },
  {
    command: "start-compute-properties-global",
    description: "Starts the global compute properties workflow.",
    handler: async () => {
      logger().info("Starting global compute properties workflow.");
      await startComputePropertiesWorkflowGlobal();
      logger().info("Started global compute properties workflow.");
    },
  },
  {
    command: "stop-compute-properties-global",
    description: "Stops the global compute properties workflow.",
    handler: async () => {
      logger().info("Stopping global compute properties workflow.");
      await stopComputePropertiesWorkflowGlobal();
      logger().info("Stopped global compute properties workflow.");
    },
  },
  {
    command: "find-due-workspaces",
    description: "Find due workspaces.",
    builder: (cmd) =>
      cmd.options({
        interval: { type: "number", alias: "i" },
        limit: { type: "number", alias: "l" },
      }),
    handler: async ({ interval, limit }) => {
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
  },
  {
    command: "migrate",
    description: "Run migrations.",
    handler: async () => {
      logger().info("Running migrations");
      await publicDrizzleMigrate();
      logger().info("Migrations complete");
    },
  },
];
