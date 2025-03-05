/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, import/no-dynamic-require, global-require, @typescript-eslint/no-var-requires */
import path from "path";

import config from "./config";

export function loadDynamicModule<T>({
  moduleName,
  fallback,
}: {
  moduleName: string;
  fallback: T;
}): T {
  const { overrideDir } = config();
  if (!overrideDir) {
    return fallback;
  }
  const modulePath = path.join(overrideDir, moduleName);
  const module = require(modulePath);
  return module as T;
}
