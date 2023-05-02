// yarn workspace api ts-node scripts/onboardUser.ts --email=name+test1@email.com --workspace=Default
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { onboardUser as ou } from "backend-lib/src/onboarding";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

async function onboardUser() {
  const argv = await yargs(hideBin(process.argv))
    .options({
      email: { type: "string", demandOption: true },
      workspace: { type: "string", demandOption: true },
    })
    .strict()
    .parse();

  if (backendConfig().logConfig) {
    logger().info(backendConfig(), "Initialized with config");
  }
  return ou({
    email: argv.email,
    workspaceName: argv.workspace,
  });
}

onboardUser().catch((e) => {
  console.error(e);
  process.exit(1);
});
