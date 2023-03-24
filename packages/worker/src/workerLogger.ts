/**
 * Provides compatibility layer between temporal logger interface and pino
 */
import { LogLevel, LogMetadata } from "@temporalio/worker";
import backendLogger, { LogFn } from "backend-lib/src/logger";

export function log(level: LogLevel, message: string, meta?: LogMetadata) {
  const logger = backendLogger();
  let logFn: LogFn;
  switch (level) {
    case "DEBUG":
      logFn = logger.debug.bind(logger);
      break;
    case "INFO":
      logFn = logger.info.bind(logger);
      break;
    case "WARN":
      logFn = logger.warn.bind(logger);
      break;
    case "ERROR":
      logFn = logger.error.bind(logger);
      break;
    case "TRACE":
      logFn = logger.trace.bind(logger);
      break;
  }
  if (meta) {
    logFn(meta, message);
  } else {
    logFn(message);
  }
}

export function trace(message: string, meta?: LogMetadata) {
  log("TRACE", message, meta);
}

export function debug(message: string, meta?: LogMetadata) {
  log("DEBUG", message, meta);
}

export function info(message: string, meta?: LogMetadata) {
  log("INFO", message, meta);
}

export function warn(message: string, meta?: LogMetadata) {
  log("WARN", message, meta);
}

export function error(message: string, meta?: LogMetadata) {
  log("ERROR", message, meta);
}

const workerLogger = {
  log,
  trace,
  info,
  warn,
  error,
  debug,
};

export default workerLogger;
