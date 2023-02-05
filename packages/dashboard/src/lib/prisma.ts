import { PrismaClient } from "@prisma/client";
import buildConfig from "backend-lib/src/prisma/buildConfig";

// This package is intended to be consumable by Next.js projects.
//
// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more:
// https://pris.ly/d/help/next-js-best-practices

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var, vars-on-top
  var PRISMA: PrismaClient | null;
}

// eslint-disable-next-line import/no-mutable-exports
let PRISMA: PrismaClient | null = null;

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
