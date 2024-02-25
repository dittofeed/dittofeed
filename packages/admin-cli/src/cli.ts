import { createAdminApiKey } from "backend-lib/src/adminApiKeys";
import { bootstrapWorker } from "backend-lib/src/bootstrap";
import { computeState } from "backend-lib/src/computedProperties/computePropertiesIncremental";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { onboardUser } from "backend-lib/src/onboarding";
import prisma from "backend-lib/src/prisma";
import { findManySegmentResourcesSafe } from "backend-lib/src/segments";
import {
  resetComputePropertiesWorkflow,
  resetGlobalCron,
} from "backend-lib/src/segments/computePropertiesWorkflow/lifecycle";
import { findAllUserPropertyResources } from "backend-lib/src/userProperties";
import {
  SENDGRID_SECRET,
  SENDGRID_WEBHOOK_SECRET_NAME,
} from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { EmailProviderType, SendgridSecret } from "isomorphic-lib/src/types";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";

import { boostrapOptions, bootstrapHandler } from "./bootstrap";
import { hubspotSync } from "./hubspot";
import { spawnWithEnv } from "./spawn";

export async function cli() {
  // Ensure config is initialized, and that environment variables are set.
  backendConfig();

  await yargs(hideBin(process.argv))
    .scriptName("admin")
    .usage("$0 <cmd> [args]")
    .command(
      "bootstrap",
      "Initialize the dittofeed application and creates a workspace.",
      boostrapOptions,
      bootstrapHandler
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
      ({ workspaceId }) => bootstrapWorker({ workspaceId })
    )
    .command(
      "spawn",
      "Spawns a shell command, with dittofeed's config exported as environment variables.",
      () => {},
      () => spawnWithEnv(process.argv.slice(3))
    )
    .command(
      "prisma",
      "Spawns prisma with dittofeed's config exported as environment variables.",
      () => {},
      () =>
        spawnWithEnv(
          ["yarn", "workspace", "backend-lib", "prisma"].concat(
            process.argv.slice(3)
          )
        )
    )
    .command(
      "psql",
      "Spawns psql with dittofeed's config used to authenticate.",
      () => {},
      () => spawnWithEnv(["psql", backendConfig().databaseUrl])
    )
    .command(
      "clickhouse-client",
      "Spawns clickhouse-client with dittofeed's config used to authenticate.",
      () => {},
      async () => {
        const host = new URL(backendConfig().clickhouseHost).hostname;
        spawnWithEnv(["clickhouse-client", `--host=${host}`]);
      }
    )
    .command(
      "clickhouse client",
      "Spawns 'clickhouse client' with dittofeed's config used to authenticate. Useful for local development for users that installed both clickhouse server and client.",
      () => {},
      async () => {
        const host = new URL(backendConfig().clickhouseHost).hostname;
        spawnWithEnv(["clickhouse", "client", `--host=${host}`]);
      }
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
      async function handler({
        workspaceName,
        email,
      }: {
        workspaceName: string;
        email: string;
      }) {
        const onboardUserResult = await onboardUser({ workspaceName, email });
        unwrap(onboardUserResult);
      }
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
        hubspotSync({ workspaceId, email, from, updateEmail })
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
        }),
      async ({ workspaceId }) => {
        const workspaceIds = workspaceId?.split(",");
        const workspaces = await prisma().workspace.findMany({
          where: {
            id: {
              in: workspaceIds,
            },
          },
        });
        await Promise.all(
          workspaces.map(async (workspace) => {
            await resetComputePropertiesWorkflow({
              workspaceId: workspace.id,
            });
            logger().info(
              `Reset compute properties workflow for workspace ${workspace.name} ${workspace.id}.`
            );
          })
        );
        logger().info("Done.");
      }
    )
    .command(
      "reset-global-cron",
      "Resets global cron job.",
      () => {},
      async () => {
        await resetGlobalCron();
        logger().info("Done.");
      }
    )
    .command(
      "config-print",
      "Prints the backend config used by dittofeed aplications.",
      () => {},
      () => {
        logger().info(backendConfig(), "Backend Config");
      }
    )
    .command(
      "migrations email-provider-secret",
      "Runs migrations, copying api keys on email providers to the secrets table.",
      () => {},
      async () => {
        await prisma().$transaction(async (pTx) => {
          const emailProviders = await pTx.emailProvider.findMany();
          await Promise.all(
            emailProviders.map(async (emailProvider) => {
              const webhookSecret = await pTx.secret.findUnique({
                where: {
                  workspaceId_name: {
                    workspaceId: emailProvider.workspaceId,
                    name: SENDGRID_WEBHOOK_SECRET_NAME,
                  },
                },
              });
              const sendgridSecretDefinition: SendgridSecret = {
                apiKey: emailProvider.apiKey ?? undefined,
                webhookKey: webhookSecret?.value ?? undefined,
                type: EmailProviderType.Sendgrid,
              };
              const secret = await pTx.secret.create({
                data: {
                  workspaceId: emailProvider.workspaceId,
                  name: SENDGRID_SECRET,
                  configValue: sendgridSecretDefinition,
                },
              });
              await pTx.emailProvider.update({
                where: {
                  id: emailProvider.id,
                },
                data: {
                  secretId: secret.id,
                },
              });
            })
          );
        });
      }
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
      }
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
      }
    )
    .demandCommand(1, "# Please provide a valid command")
    .help()
    .parse();
}
