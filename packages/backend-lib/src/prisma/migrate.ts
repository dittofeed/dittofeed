import spawn from "cross-spawn";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { Client } from "pg";
import { PostgresError } from "pg-error-enum";

import config from "../config";
import { db } from "../db";
import logger from "../logger";

function databaseUrlWithoutName() {
  const { databaseUrl } = config();
  const url = new URL(databaseUrl);
  url.pathname = "";
  return url.toString();
}

// FIXME rename file
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

  const migrationsFolder = path.join(__dirname, "..", "..", "drizzle");
  await migrate(db(), {
    migrationsFolder,
  });
}

export async function prismaMigrate() {
  await new Promise<void>((resolve, reject) => {
    spawn("yarn", ["workspace", "backend-lib", "prisma", "migrate", "deploy"], {
      stdio: "inherit",
    }).once("exit", (exitCode, signal) => {
      if (typeof exitCode === "number") {
        if (exitCode === 0) {
          resolve();
        } else {
          reject(
            new Error(`Migration failed with exit code: ${String(exitCode)}`),
          );
        }
      } else if (signal) {
        reject(new Error(`Migration failed with signal: ${String(signal)}`));
      } else {
        resolve();
      }
    });
  });
}
