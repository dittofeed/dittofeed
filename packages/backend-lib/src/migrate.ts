import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { Client } from "pg";
import { PostgresError } from "pg-error-enum";

import config, { databaseUrlWithoutName } from "./config";
import { db } from "./db";
import logger from "./logger";

export async function drizzleMigrate() {
  const client = new Client(databaseUrlWithoutName());
  const { database } = config();
  try {
    await client.connect();
    await client.query(`
      CREATE DATABASE ${database}
    `);
  } catch (e) {
    const error = e as Error;
    if (
      "code" in error &&
      typeof error.code === "string" &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      error.code === PostgresError.DUPLICATE_DATABASE
    ) {
      logger().info({ database }, "Database already exists");
    } else {
      throw error;
    }
  } finally {
    await client.end();
  }

  const migrationsFolder = path.join(__dirname, "..", "drizzle");

  logger().info({ migrationsFolder }, "Running migrations");
  await migrate(db(), {
    migrationsFolder,
  });
}
