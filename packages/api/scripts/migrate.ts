import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { prismaMigrate } from "backend-lib/src/prisma/migrate";

async function migrateStart() {
  if (backendConfig().logConfig) {
    logger().info(backendConfig(), "Initialized with config");
  }
  await prismaMigrate();
}

migrateStart().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
