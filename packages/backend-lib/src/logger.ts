import * as HyperDX from "@hyperdx/node-opentelemetry";
import pino from "pino";

import config from "./config";
import { getServiceName } from "./openTelemetry/constants";
import { Logger } from "./types";

let LOGGER: Logger | null = null;
let PUBLIC_LOGGER: Logger | null = null;

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
  if (!PUBLIC_LOGGER) {
    const level = config().dittofeedTelemetryDisabled
      ? "silent"
      : config().logLevel;

    const options: PinoConf = {
      level,
      mixin: HyperDX.getPinoMixinFunction,
      transport: {
        targets: [
          {
            target: "@hyperdx/node-opentelemetry/build/src/otel-logger/pino",
            options: {
              apiKey: "4d3112b9-2a84-48c2-af9e-ec96b9aacf71",
              service: getServiceName(),
            },
          },
          // Write to stdout as well
          {
            target: "pino/file",
            options: {
              destination: 1, // This means stdout, which will output JSON
            },
          },
        ],
      },
    };
    PUBLIC_LOGGER = pino(options);
  }
  return PUBLIC_LOGGER;
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
