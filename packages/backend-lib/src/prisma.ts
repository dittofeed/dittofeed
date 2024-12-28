import { type PrismaClient } from "@prisma/client";

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
    // load at runtime to enable transition to drizzle. that way if a code path
    // doesn't use it, it doesn't get loaded
    const { PrismaClient } =
      // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
      require("@prisma/client") as typeof import("@prisma/client");

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
