import { find as findTz } from "geo-tz";
import { err, ok, Result } from "neverthrow";

import { LocalTimeDelayVariantFields } from "./types";
import { findAllUserPropertyAssignments } from "./userProperties";

function getTimezone({ latLon }: { latLon: string }): Result<string, string> {
  const splitStr = latLon.split(",");
  const lat = Number(splitStr[0]);
  const lon = Number(splitStr[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return err(`invalid latLon ${latLon}`);
  }
  const tz = findTz(lat, lon)[0];
  if (!tz) {
    return err(`timezone not found for ${latLon}`);
  }
  return ok(tz);
}

export async function findNextLocalizedTime({
  workspaceId,
  userId,
  ...nexTime
}: {
  workspaceId: string;
  userId: string;
} & LocalTimeDelayVariantFields): Promise<number> {
  // fallback to utc time
  // TODO support ip lookup
  const { latLon } = await findAllUserPropertyAssignments({
    workspaceId,
    userId,
    userProperties: ["latLon"],
  });

  if (typeof latLon === "string") {
    const tzResult = getTimezone({ latLon });
  }

  return 0;
}
