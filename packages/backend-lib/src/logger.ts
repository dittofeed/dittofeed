import * as HyperDX from "@hyperdx/node-opentelemetry";
import pino from "pino";

import config from "./config";
import { getServiceName } from "./openTelemetry/constants";
import { Logger } from "./types";

let LOGGER: Logger | null = null;

export { type LogFn } from "pino";

const PinoLevelToSeverityLookup = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
  fatal: "CRITICAL",
};

type PinoLevel = keyof typeof PinoLevelToSeverityLookup;

function isPinoLevel(value: string): value is PinoLevel {
  return value in PinoLevelToSeverityLookup;
}

type PinoConf = Parameters<typeof pino>[0];

const googleOpsConfig: PinoConf = {
  messageKey: "message",
  formatters: {
    level(label, number) {
      const severity: string = isPinoLevel(label)
        ? PinoLevelToSeverityLookup[label]
        : PinoLevelToSeverityLookup.info;

      return {
        severity,
        level: number,
      };
    },
  },
};

export function publicLogger(): Logger {
  throw new Error("Not implemented");
}

export default function logger(): Logger {
  if (!LOGGER) {
    let options: PinoConf;
    if (config().prettyLogs) {
      options = {
        level: config().logLevel,
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      };
    } else {
      const { exportLogsHyperDx, hyperDxApiKey, logLevel } = config();

      options = {
        level: logLevel,
      };
      if (config().googleOps) {
        Object.assign(options, googleOpsConfig);
      } else if (exportLogsHyperDx && hyperDxApiKey) {
        options.mixin = HyperDX.getPinoMixinFunction;

        options.transport = {
          targets: [
            {
              target: "@hyperdx/node-opentelemetry/build/src/otel-logger/pino",
              options: {
                apiKey: hyperDxApiKey,
                service: getServiceName(),
              },
              level: logLevel,
            },
          ],
        };
      }
    }

    const l = pino(options);
    LOGGER = l;
    return l;
  }
  return LOGGER;
}
