import { PrismaClient } from "@prisma/client";

import config from "../config";

export type PrismaClientConfig = ConstructorParameters<typeof PrismaClient>[0];

function buildConfig(): PrismaClientConfig {
  const prismaConfig: PrismaClientConfig = {
    datasources: {
      db: {
        url: config().databaseUrl,
      },
    },
  };
  return prismaConfig;
}

export default buildConfig;
