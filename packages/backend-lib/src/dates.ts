import { add } from "date-fns";
import { getTimezoneOffset } from "date-fns-tz";
import { find as findTz } from "geo-tz";

import { LocalTimeDelayVariantFields } from "./types";

const DEFAULT_TIMEZONE = "UTC";
const EVERY_DAY_IN_WEEK = new Set([0, 1, 2, 3, 4, 5, 6]);

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
  now,
  hour,
  minute = 0,
  allowedDaysOfWeek,
}: LocalTimeDelayVariantFields & {
  latLon?: string;
  now: number;
}): number | null {
  if (Number.isNaN(now)) {
    return null;
  }
  const timezone =
    typeof latLon === "string" ? getTimezone({ latLon }) : DEFAULT_TIMEZONE;
  const offset = getTimezoneOffset(timezone);
  const zoned = offset + now;
  let adjusted = new Date(zoned);
  adjusted.setUTCHours(hour, minute, 0, 0);

  const allowedDays = allowedDaysOfWeek
    ? new Set(allowedDaysOfWeek)
    : EVERY_DAY_IN_WEEK;

  for (let i = 0; i < 8; i++) {
    if (adjusted.getTime() > zoned && allowedDays.has(adjusted.getDay())) {
      return adjusted.getTime() - offset;
    }
    adjusted = add(adjusted, { days: 1 });
  }

  throw new Error("Could not find next localized time");
}
