import bootstrap from "backend-lib/src/bootstrap";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

async function boostrapStart() {
  if (backendConfig().logConfig) {
    logger().info(backendConfig(), "Initialized with config");
  }
  let workspaceId: string;
  if (backendConfig().authMode === "multi-tenant") {
    const argv = await yargs(hideBin(process.argv))
      .options({
        workspaceId: { type: "string", demandOption: true },
      })
      .strict()
      .parse();
    workspaceId = argv.workspaceId;
  } else {
    const argv = await yargs(hideBin(process.argv))
      .options({
        workspaceId: { type: "string" },
      })
      .strict()
      .parse();

    workspaceId = argv.workspaceId ?? backendConfig().defaultWorkspaceId;
  }

  return bootstrap({ workspaceId });
}

boostrapStart().catch((e) => {
  console.error(e);
  process.exit(1);
});
