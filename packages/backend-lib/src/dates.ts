import { add, set } from "date-fns";
import { format, getTimezoneOffset, utcToZonedTime } from "date-fns-tz";
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
  const offset = getTimezoneOffset(timezone, now);
  const nowDate = new Date(now);
  const currentLocalizedHour =
    (nowDate.getUTCHours() - offset / (60 * 60 * 1000)) % 23;
  const currentLocalizedMinute =
    (nowDate.getUTCMinutes() - offset / (60 * 60 * 1000)) % 23;

  // invalid
  let zoned = utcToZonedTime(new Date(now), timezone);
  console.log("times", {
    now,
    zonedTime: zoned.getTime(),
    nowDate: new Date(now),
    zoned,
    minute,
    hour,
    timezone,
    zonedHour: zoned.getHours(),
    zonedDay: zoned.getDay(),
    nowFormatted: format(new Date(now), "yyyy-MM-dd HH:mm:ssxxx", {
      timeZone: timezone,
    }),
    zonedFormatted: format(zoned, "yyyy-MM-dd HH:mm:ssxxx", {
      timeZone: timezone,
    }),
  });
  zoned = set(zoned, {
    hours: hour,
    minutes: minute,
    seconds: 0,
    milliseconds: 0,
  });

  const allowedDays = allowedDaysOfWeek
    ? new Set(allowedDaysOfWeek)
    : EVERY_DAY_IN_WEEK;

  for (let i = 0; i < 7; i++) {
    console.log("zoned i", zoned, i);
    console.log(
      "zoned formatted",
      format(zoned, "yyyy-MM-dd HH:mm:ssxxx", {
        timeZone: timezone,
      })
    );
    console.log("zoned day", zoned.getDay());
    console.log("zoned hour", zoned.getHours());
    console.log("zoned iso ", zoned.toISOString());
    console.log("zoned time", zoned.getTime());
    console.log("zoned greater ", zoned.getTime() > now);
    if (zoned.getTime() > now && allowedDays.has(zoned.getDay())) {
      return zoned.getTime();
    }
    zoned = add(zoned, { days: 1 });
  }

  throw new Error("Could not find next localized time");
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
}: FindNextLocalizedTimeParams): Promise<number | null> {
  // TODO support ip lookup
  const { latLon } = await findAllUserPropertyAssignments({
    workspaceId,
    userId,
    userProperties: ["latLon"],
  });
  const latLonStr = typeof latLon === "string" ? latLon : undefined;
  return findNextLocalizedTimeInner({ latLon: latLonStr, ...rest });
}
