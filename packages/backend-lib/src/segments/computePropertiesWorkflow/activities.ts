import { pick } from "remeda";

import getConfig, { Config } from "../../config";

export { findManyJourneysUnsafe as findAllJourneysUnsafe } from "../../journeys";
export { findAllUserProperties } from "../../userProperties";
export * from "./activities/computeProperties";
export * from "./activities/performBroadcast";

export async function config(
  keys: (keyof Config)[]
): Promise<Pick<Config, (typeof keys)[number]>> {
  return pick(getConfig(), keys);
}
