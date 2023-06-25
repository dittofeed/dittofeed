import bootstrap from "backend-lib/src/bootstrap";
import backendConfig from "backend-lib/src/config";
import { prismaMigrate } from "backend-lib/src/prisma/migrate";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";

export async function cli() {
  // Ensure config is initialized
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
    .command("migrate", "Run's 'prisma migrate deploy'.", prismaMigrate)
    .demandCommand(1, "# Please provide a valid command")
    .help()
    .parse();
}
