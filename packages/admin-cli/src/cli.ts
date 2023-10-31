import { bootstrapWorker } from "backend-lib/src/bootstrap";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { onboardUser } from "backend-lib/src/onboarding";
import prisma from "backend-lib/src/prisma";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ChannelType, EmailTemplateResource } from "isomorphic-lib/src/types";
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
      "config-print",
      "Prints the backend config used by dittofeed aplications.",
      () => {},
      () => {
        logger().info(backendConfig(), "Backend Config");
      }
    )
    .command(
      "migrations email-templates",
      "Runs migrations for email templates converting them to generic template model.",
      () => {},
      async () => {
        const emailTemplates = await prisma().emailTemplate.findMany();
        await Promise.all(
          emailTemplates.map((emailTemplate) => {
            const definition: EmailTemplateResource = {
              type: ChannelType.Email,
              from: emailTemplate.from,
              subject: emailTemplate.subject,
              replyTo: emailTemplate.replyTo ?? undefined,
              body: emailTemplate.body,
            };

            return prisma().messageTemplate.upsert({
              where: {
                id: emailTemplate.id,
              },
              update: {
                name: emailTemplate.name,
                definition,
                workspaceId: emailTemplate.workspaceId,
              },
              create: {
                workspaceId: emailTemplate.workspaceId,
                id: emailTemplate.id,
                name: emailTemplate.name,
                definition,
              },
            });
          })
        );
      }
    )
    .demandCommand(1, "# Please provide a valid command")
    .help()
    .parse();
}
