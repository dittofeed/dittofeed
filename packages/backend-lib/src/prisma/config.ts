import { PrismaClient } from "@prisma/client";

import config from "../config";

const prismaConfig: ConstructorParameters<typeof PrismaClient>[0] = {
  datasources: {
    db: {
      url: config().databaseUrl,
    },
  },
};

export default prismaConfig;
