import bootstrap from "backend-lib/src/bootstrap";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

async function bootsrapStart() {
  if (backendConfig().logConfig) {
    logger().info(backendConfig(), "Initialized with config");
  }
  let workspaceId: string;
  let workspaceName: string;
  let workspaceDomain: string | null = null;

  if (backendConfig().authMode === "multi-tenant") {
    const argv = await yargs(hideBin(process.argv))
      .options({
        workspaceId: { type: "string", demandOption: true },
        workspaceName: { type: "string", demandOption: true },
        workspaceDomain: { type: "string" },
      })
      .strict()
      .parse();
    workspaceId = argv.workspaceId;
    workspaceName = argv.workspaceName;
    workspaceDomain = argv.workspaceDomain ?? null;
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

  return bootstrap({ workspaceId, workspaceName, workspaceDomain });
}

bootsrapStart().catch((e) => {
  console.error(e);
  process.exit(1);
});
