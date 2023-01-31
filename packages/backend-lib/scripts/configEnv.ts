import spawn from "cross-spawn";

import config from "../src/config";

const argv = process.argv.slice(2);

config();

if (!argv[0]) {
  process.exit(0);
}

spawn(argv[0], argv.slice(1), { stdio: "inherit" }).on(
  "exit",
  (exitCode, signal) => {
    if (typeof exitCode === "number") {
      process.exit(exitCode);
    } else if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(0);
    }
  }
);
