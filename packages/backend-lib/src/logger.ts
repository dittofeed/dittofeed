import { Logger, pino } from "pino";

import config from "./config";

let LOGGER: Logger | null = null;

export { type LogFn } from "pino";

export default function logger() {
  if (!LOGGER) {
    let options: Parameters<typeof pino>[0];
    if (config().prettyLogs) {
      options = {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      };
    } else {
      options = {
        level: config().logLevel,
      };
    }
    LOGGER = pino(options);
  }
  return LOGGER;
}
