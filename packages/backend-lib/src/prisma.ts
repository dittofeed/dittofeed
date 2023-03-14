import { PrismaClient } from "@prisma/client";

import buildConfig from "./prisma/buildConfig";

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var, vars-on-top
  var PRISMA: PrismaClient | null;
}

// eslint-disable-next-line import/no-mutable-exports
let PRISMA: PrismaClient | null = null;

export { Prisma } from "@prisma/client";

function prisma(): PrismaClient {
  if (!PRISMA) {
    if (process.env.NODE_ENV === "production") {
      PRISMA = new PrismaClient(buildConfig());
    } else {
      if (!global.PRISMA) {
        global.PRISMA = new PrismaClient(buildConfig());
      }
      PRISMA = global.PRISMA;
    }
  }
  return PRISMA;
}
export default prisma;
