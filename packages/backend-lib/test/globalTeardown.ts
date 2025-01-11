import { Client } from "pg";
import { PostgresError } from "pg-error-enum";

import { clickhouseClient } from "../src/clickhouse";
import config, { databaseUrlWithoutName } from "../src/config";
import { pool } from "../src/db";
import logger from "../src/logger";

async function dropClickhouse() {
  await clickhouseClient().exec({
    query: `DROP DATABASE IF EXISTS ${config().clickhouseDatabase} SYNC`,
    clickhouse_settings: {
      wait_end_of_query: 1,
    },
  });
  await clickhouseClient().close();
}

async function dropPostgres() {
  await pool().end();
  const client = new Client(databaseUrlWithoutName());
  const { database } = config();
  try {
    await client.connect();
    await client.query(`
      DROP DATABASE ${database}
    `);
  } catch (e) {
    const error = e as Error;
    if (
      "code" in error &&
      typeof error.code === "string" &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      error.code === PostgresError.UNDEFINED_DATABASE
    ) {
      logger().info({ database }, "Database does not exist");
    } else {
      throw error;
    }
  } finally {
    await client.end();
  }
}

export default async function globalTeardown() {
  await Promise.all([dropClickhouse(), dropPostgres()]);
}
