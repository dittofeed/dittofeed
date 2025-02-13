import { Client } from "pg";
import { PostgresError } from "pg-error-enum";

import { clickhouseClient } from "../src/clickhouse";
import config, { databaseUrlWithoutName } from "../src/config";
import { endPool, pool } from "../src/db";
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
  // await endPool();
  console.log("main pool ended");
  const { databaseUser, databasePassword, databaseHost, databasePort } =
    config();
  const client = new Client({
    user: databaseUser,
    password: databasePassword,
    host: databaseHost,
    database: "postgres",
    port: parseInt(databasePort ?? "5432", 10),
  });
  const { database } = config();
  console.log("dropping postgres database", database, databaseUrlWithoutName());
  try {
    await client.connect();
    console.log("client connected", {
      database: client.database,
      user: client.user,
      host: client.host,
      port: client.port,
    });
    const activeConns = await client.query(`
  SELECT datname, pid, application_name, usename, state
  FROM pg_stat_activity 
  WHERE datname = '${database}'
`);
    console.log("Active connections:", activeConns.rows);
    console.log("loc0");
    await client.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${database}'
      AND pid <> pg_backend_pid()
    `);
    console.log("loc1");
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
    console.log("postgres client ended");
  }
}

export default async function globalTeardown() {
  await Promise.all([dropClickhouse(), dropPostgres()]);
}
