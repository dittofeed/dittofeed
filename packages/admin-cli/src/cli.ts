import backendConfig from "backend-lib/src/config";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";

import { createCommands } from "./commandDefinitions";

export async function cli() {
  // Ensure config is initialized, and that environment variables are set.
  backendConfig();

  const parser = yargs(hideBin(process.argv))
    .scriptName("admin")
    .usage("$0 <cmd> [args]");

  await createCommands(parser)
    .demandCommand(1, "# Please provide a valid command")
    .recommendCommands()
    .help()
    .parse();
}
