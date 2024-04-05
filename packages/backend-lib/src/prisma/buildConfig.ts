import { PrismaClient } from "@prisma/client";

import config from "../config";
import { NodeEnvEnum } from "../types";

export type PrismaClientConfig = ConstructorParameters<typeof PrismaClient>[0];

function buildConfig(): PrismaClientConfig {
  const prismaConfig: PrismaClientConfig = {
    datasources: {
      db: {
        url: config().databaseUrl,
      },
    },
  };

  if (config().nodeEnv === NodeEnvEnum.Development) {
    prismaConfig.log = ["query", "info", "warn", "error"];
  }
  return prismaConfig;
}

export default buildConfig;
