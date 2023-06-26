import spawn from "cross-spawn";

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

  return new Promise((resolve) => {
    spawn(arg1, argv.slice(1), { stdio: "inherit" }).on(
      "exit",
      (exitCode, signal) => {
        if (typeof exitCode === "number") {
          process.exit(exitCode);
        } else if (signal) {
          process.kill(process.pid, signal);
        } else {
          resolve();
        }
      }
    );
  });
}
