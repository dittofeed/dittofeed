import { pick } from "remeda";

import getConfig, { Config } from "../../config";

export { findManyJourneysUnsafe as findAllJourneysUnsafe } from "../../journeys";
export { findAllUserProperties } from "../../userProperties";
export * from "./activities/computeProperties";
export * from "./activities/computePropertiesScheduler";
export * from "./activities/performBroadcast";

// eslint-disable-next-line @typescript-eslint/require-await
export async function config(
  keys: (keyof Config)[],
): Promise<Pick<Config, (typeof keys)[number]>> {
  return pick(getConfig(), keys);
}
