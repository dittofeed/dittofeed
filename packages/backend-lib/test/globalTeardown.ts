import { clickhouseClient } from "../src/clickhouse";
import config from "../src/config";
import prisma from "../src/prisma";

async function dropClickhouse() {
  await clickhouseClient().exec({
    query: `DROP DATABASE IF EXISTS ${config().clickhouseDatabase} SYNC`,
    clickhouse_settings: {
      wait_end_of_query: 1,
    },
  });
  await clickhouseClient().close();
}

export default async function globalTeardown() {
  await Promise.all([
    dropClickhouse(),
    prisma().$executeRaw`DROP DATABASE IF EXISTS ${config().database};`,
  ]);
}
