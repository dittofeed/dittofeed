import { migrate as kitMigrate } from "drizzle-kit/api";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import fs from "fs/promises";
import path from "path";
import { Client } from "pg";
import { PostgresError } from "pg-error-enum";

import config, { databaseUrlWithoutName } from "./config";
import { db } from "./db";
import logger from "./logger";

async function checkDirectory(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

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

  let migrationsFolder = path.join(__dirname, "..", "drizzle");
  if (!(await checkDirectory(migrationsFolder))) {
    logger().info(
      { migrationsFolder },
      "Migrations folder not found, trying root package dir",
    );
    migrationsFolder = path.join(__dirname, "..", "..", "drizzle");
    if (!(await checkDirectory(migrationsFolder))) {
      logger().error(
        { migrationsFolder },
        "Migrations folder not found, aborting",
      );
      throw new Error("Migrations folder not found");
    }
  }

  logger().info({ migrationsFolder }, "Running migrations");
  await migrate(db(), {
    migrationsFolder,
  });
}
