import config from "backend-lib/src/config";
import { NodeEnvEnum } from "backend-lib/src/types";
import next from "next";
import path from "path";

export default async function buildCustomServer({ dir }: { dir: string }) {
  const { nodeEnv } = config();
  console.log("loc1 buildCustomServer", { dir, nodeEnv });
  const nextApp = next({
    dev: nodeEnv === NodeEnvEnum.Development,
    dir,
  });
  await nextApp.prepare();
  return nextApp;
}
