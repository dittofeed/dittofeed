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
  let workspaceName: string;

  if (backendConfig().authMode === "multi-tenant") {
    const argv = await yargs(hideBin(process.argv))
      .options({
        workspaceId: { type: "string", demandOption: true },
        workspaceName: { type: "string", demandOption: true },
      })
      .strict()
      .parse();
    workspaceId = argv.workspaceId;
    workspaceName = argv.workspaceName;
  } else {
    const argv = await yargs(hideBin(process.argv))
      .options({
        workspaceId: { type: "string" },
        workspaceName: { type: "string" },
      })
      .strict()
      .parse();

    workspaceId = argv.workspaceId ?? backendConfig().defaultWorkspaceId;
    workspaceName = argv.workspaceName ?? "Default";
  }

  return bootstrap({ workspaceId, workspaceName });
}

boostrapStart().catch((e) => {
  console.error(e);
  process.exit(1);
});
