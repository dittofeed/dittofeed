import { add, set } from "date-fns";
import {
  format,
  getTimezoneOffset,
  utcToZonedTime,
  formatInTimeZone,
} from "date-fns-tz";
import { find as findTz } from "geo-tz";

import logger from "./logger";
import { LocalTimeDelayVariantFields } from "./types";
import { findAllUserPropertyAssignments } from "./userProperties";

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

function modDiff(a: number, b: number, mod: number): number {
  let diff = (a - b) % mod;

  // Adjust diff to be non-negative
  if (diff < 0) {
    diff += mod;
  }

  return diff;
}

function padWithLeadingZeros(number: number) {
  return String(number).padStart(2, "0");
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
  const zoned = new Date(offset + now);
  let adjusted = new Date(
    format(
      zoned,
      `yyyy-MM-dd'T'${padWithLeadingZeros(hour)}:${padWithLeadingZeros(
        minute
      )}:00.000'Z'`
    )
  );

  const allowedDays = allowedDaysOfWeek
    ? new Set(allowedDaysOfWeek)
    : EVERY_DAY_IN_WEEK;

  for (let i = 0; i < 8; i++) {
    if (
      adjusted.getTime() > zoned.getTime() &&
      allowedDays.has(adjusted.getDay())
    ) {
      return adjusted.getTime() - offset;
    }
    adjusted = add(adjusted, { days: 1 });
  }

  throw new Error("Could not find next localized time");
}
