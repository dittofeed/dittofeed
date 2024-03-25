import spawn from "cross-spawn";
import path from "path";

/**
 * Spawns a shell command, with dittofeed's config exported as environment variables.
 * @param argv
 * @returns
 */
export function spawnWithEnv(argv: string[]): Promise<void> {
  const arg1 = argv[0];
  if (!arg1) {
    process.exit(0);
  }
  const cwd = path.join(__dirname, "..", "..", "..");

  return new Promise((resolve) => {
    spawn(arg1, argv.slice(1), { stdio: "inherit", cwd }).on(
      "exit",
      (exitCode, signal) => {
        if (typeof exitCode === "number") {
          process.exit(exitCode);
        } else if (signal) {
          process.kill(process.pid, signal);
        } else {
          resolve();
        }
      },
    );
  });
}

export async function spawnWithEnvSafe(argv: string[]): Promise<void> {
  const arg1 = argv[0];
  if (!arg1) {
    throw new Error("No command provided");
  }
  const cwd = path.join(__dirname, "..", "..", "..");

  return new Promise((resolve, reject) => {
    spawn(arg1, argv.slice(1), { stdio: "inherit", cwd }).on(
      "exit",
      (exitCode, signal) => {
        if (exitCode === 0) {
          return resolve();
        }

        if (typeof exitCode === "number") {
          reject(
            new Error(`Process ${process.pid} exited with code: ${exitCode}`),
          );
        } else if (signal) {
          reject(
            new Error(`Process ${process.pid} killed with signal: ${signal}`),
          );
        } else {
          resolve();
        }
      },
    );
  });
}
