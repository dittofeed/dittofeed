import { find as findTz } from "geo-tz";

import logger from "./logger";
import { LocalTimeDelayVariantFields } from "./types";
import { findAllUserPropertyAssignments } from "./userProperties";

const DEFAULT_TIMEZONE = "UTC";

function getTimezone({ latLon }: { latLon: string }): string {
  const splitStr = latLon.split(",");
  const lat = Number(splitStr[0]);
  const lon = Number(splitStr[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return DEFAULT_TIMEZONE;
  }
  const tz = findTz(lat, lon)[0];
  if (!tz) {
    return DEFAULT_TIMEZONE;
  }
  return tz;
}

export function findNextLocalizedTimeInner({
  latLon,
}: LocalTimeDelayVariantFields & {
  latLon?: string;
  now: number;
}) {
  const timezone =
    typeof latLon === "string" ? getTimezone({ latLon }) : DEFAULT_TIMEZONE;

  return 0;
}

export type FindNextLocalizedTimeParams = {
  workspaceId: string;
  userId: string;
  now: number;
} & LocalTimeDelayVariantFields;

export async function findNextLocalizedTime({
  workspaceId,
  userId,
  ...rest
}: FindNextLocalizedTimeParams): Promise<number> {
  // TODO support ip lookup
  const { latLon } = await findAllUserPropertyAssignments({
    workspaceId,
    userId,
    userProperties: ["latLon"],
  });
  const latLonStr = typeof latLon === "string" ? latLon : undefined;
  return findNextLocalizedTimeInner({ latLon: latLonStr, ...rest });
}
