import config from "backend-lib/src/config";
import { registerBackendDi } from "backend-lib/src/registerBackendDi";
import { NodeEnvEnum } from "backend-lib/src/types";
import next from "next";

export default async function buildCustomServer({ dir }: { dir: string }) {
  registerBackendDi();
  const { nodeEnv } = config();
  const nextApp = next({
    dev: nodeEnv === NodeEnvEnum.Development,
    dir,
  });
  await nextApp.prepare();
  return nextApp;
}
