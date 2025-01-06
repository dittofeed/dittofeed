import spawn from "cross-spawn";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";

import { db } from "../db";

export async function drizzleMigrate() {
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
