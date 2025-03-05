/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, import/no-dynamic-require, global-require, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-return */
import path from "path";

import config from "./config";

// This bypasses Webpack rewriting “require”
function forceRequire(modulePath: string) {
  // eslint-disable-next-line no-eval, @typescript-eslint/no-unsafe-call
  return eval("require")(modulePath);
}

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
  const module = forceRequire(modulePath);
  return module as T;
}
