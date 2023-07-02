import bootstrap from "backend-lib/src/bootstrap";
import backendConfig from "backend-lib/src/config";
import { prismaMigrate } from "backend-lib/src/prisma/migrate";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";

import { SDK_LANGUAGES, sdkBaseCodegen } from "./sdkBase";
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
      (cmd) =>
        cmd.options({
          "workspace-id": {
            type: "string",
            alias: "w",
            default: backendConfig().defaultWorkspaceId,
            describe: "The workspace id to bootstrap.",
          },
          "workspace-name": {
            type: "string",
            alias: "n",
            default: "Default",
            describe: "The workspace name to bootstrap.",
          },
          "workspace-domain": {
            type: "string",
            alias: "d",
            describe:
              "The email domain to authorize. All users with the provided email domain will be able to access the workspace. Example: -d=example.com",
          },
        }),
      ({ workspaceId, workspaceName, workspaceDomain }) =>
        bootstrap({
          workspaceId,
          workspaceName,
          workspaceDomain,
        })
    )
    .command("migrate", "Runs 'prisma migrate deploy'.", prismaMigrate)
    .command(
      "spawn",
      "Spawns a shell command, with dittofeed's config exported as environment variables.",
      () => {},
      (cmd) => spawnWithEnv(cmd._.slice(1).map(String))
    )
    .command(
      "prisma",
      "Spawns prisma with dittofeed's config exported as environment variables.",
      () => {},
      (cmd) =>
        spawnWithEnv(
          ["yarn", "workspace", "backend-lib", "prisma"].concat(
            cmd._.slice(1).map(String)
          )
        )
    )
    .command(
      "sdk-base-codegen",
      "Generates an openapi client for a particular language's base sdk. Note that this requires:\n* swagger-codegen 3 to be installed (https://github.com/swagger-api/swagger-codegen).\n* The api server to be running.",
      (cmd) =>
        cmd.options({
          lang: {
            type: "string",
            alias: "l",
            choices: Object.keys(SDK_LANGUAGES),
            default: backendConfig().defaultWorkspaceId,
            describe: "The workspace id to bootstrap.",
          },
        }),
      ({ lang }) => sdkBaseCodegen({ lang })
    )
    .command(
      "psql",
      "Spawns psql with dittofeed's config used to authenticate.",
      () => {},
      () => spawnWithEnv(["psql", backendConfig().databaseUrl])
    )
    .demandCommand(1, "# Please provide a valid command")
    .help()
    .parse();
}
