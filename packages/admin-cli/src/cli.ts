import bootstrap from "backend-lib/src/bootstrap";
import backendConfig from "backend-lib/src/config";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";

export async function cli() {
  yargs(hideBin(process.argv))
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
            demandOption: true,
            default: "Default",
            describe: "The workspace name to bootstrap.",
          },
          "workspace-domain": {
            type: "string",
            alias: "d",
            demandOption: true,
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
    .demandCommand(1, "# Please provide a valid command")
    .help()
    .parseSync();
}
