import spawn from "cross-spawn";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { Client } from "pg";

import config from "../config";
import { db } from "../db";

function databaseUrlWithoutName() {
  const { databaseUrl } = config();
  const url = new URL(databaseUrl);
  url.pathname = "";
  return url.toString();
}

// FIXME rename file
export async function drizzleMigrate() {
  const client = new Client(databaseUrlWithoutName());
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
