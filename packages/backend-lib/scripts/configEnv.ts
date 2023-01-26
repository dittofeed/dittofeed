import spawn from "cross-spawn";
import minimist from "minimist";

import config from "../src/config";

const argv = minimist(process.argv.slice(2));

config();

if (!argv._[0]) {
  process.exit(0);
}

spawn(argv._[0], argv._.slice(1), { stdio: "inherit" }).on(
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
