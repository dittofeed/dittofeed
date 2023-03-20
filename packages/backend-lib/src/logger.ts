import { Logger, pino } from "pino";

let LOGGER: Logger | null = null;

export default function logger() {
  if (!LOGGER) {
    LOGGER = pino({ level: "info" });
  }
  return LOGGER;
}
