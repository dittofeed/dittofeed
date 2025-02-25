import backendConfig from "backend-lib/src/config";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";

import { COMMAND_DEFINITIONS } from "./commandDefinitions";
import { registerCommands } from "./registerCommands";

export async function cli() {
  // Ensure config is initialized, and that environment variables are set.
  backendConfig();

  const parser = yargs(hideBin(process.argv))
    .scriptName("admin")
    .usage("$0 <cmd> [args]");

  await registerCommands(parser, COMMAND_DEFINITIONS);

  await parser
    .demandCommand(1, "# Please provide a valid command")
    .recommendCommands()
    .help()
    .parse();
}
