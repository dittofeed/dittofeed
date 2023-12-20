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

  // const nowDate = set(new Date(now), {
  //   milliseconds: 0,
  //   seconds: 0,
  // });

  // invalid
  // let zoned = utcToZonedTime(nowDate, timezone);
  // const offset = getTimezoneOffset(timezone);
  // let zoned = set(new Date(now + offset), {
  //   milliseconds: 0,
  //   seconds: 0,
  //   minutes: minute,
  //   hours: hour,
  // });
  let zoned = utcToZonedTime(
    new Date(now).setUTCHours(hour, minute, 0, 0),
    timezone
  );
  // hour = zoned - diff -> diff = zoned - hour
  // (zoned + diff) % 23 = hour
  // const hourDiff = modDiff(hour, zoned.getUTCHours(), 23);
  // const minuteDiff = modDiff(minute, zoned.getUTCMinutes(), 60);
  // let adjustedNow = add(nowDate, {
  //   hours: hourDiff,
  //   minutes: minuteDiff,
  // });

  // console.log("times", {
  //   now,
  //   zonedTime: zoned.getTime(),
  //   nowDate: new Date(now),
  //   zoned,
  //   minute,
  //   hour,
  //   timezone,
  //   zonedHour: zoned.getHours(),
  //   zonedDay: zoned.getDay(),
  //   nowFormatted: format(new Date(now), "yyyy-MM-dd HH:mm:ssxxx", {
  //     timeZone: timezone,
  //   }),
  //   zonedFormatted: format(zoned, "yyyy-MM-dd HH:mm:ssxxx", {
  //     timeZone: timezone,
  //   }),
  // });
  // zoned = set(zoned, {
  //   hours: hour,
  //   minutes: minute,
  //   seconds: 0,
  //   milliseconds: 0,
  // });
  // zoned = add(zoned, { days: -1 });

  const allowedDays = allowedDaysOfWeek
    ? new Set(allowedDaysOfWeek)
    : EVERY_DAY_IN_WEEK;

  // console.log({ nowDate, hourDiff, minuteDiff, zoned });

  for (let i = 0; i < 7; i++) {
    // console.log("zoned i", zoned, i);
    // console.log(
    //   "zoned formatted",
    //   format(zoned, "yyyy-MM-dd HH:mm:ssxxx", {
    //     timeZone: timezone,
    //   })
    // );
    // console.log("zoned day", zoned.getDay());
    // console.log("zoned hour", zoned.getHours());
    // console.log("zoned iso ", zoned.toISOString());
    // console.log("zoned time", zoned.getTime());
    // console.log("zoned greater ", zoned.getTime() > now);
    // console.log({
    //   adjustedNow,
    // });
    // const day = utcToZonedTime(adjustedNow, timezone).getDay();
    // if (adjustedNow.getTime() > now && allowedDays.has(day)) {
    //   return adjustedNow.getTime();
    // }
    // adjustedNow = add(adjustedNow, { days: 1 });
    if (zoned.getTime() > now && allowedDays.has(zoned.getDay())) {
      console.log("found next localized time", {
        zoned: zoned.toISOString(),
        //     formattedZoned: format(zoned, "yyyy-MM-dd HH:mm:ssxxx", {
        //       timeZone: timezone,
        //     }),
        //     // when timezone is Asia/Tokyo
        //     // and now is '2023-12-19T23:00:12.123Z'
        //     // would expect this to show 8 am but is showing 3 pm
        //     // '2023-12-19 15:00:12+09:00'
        //     // format(new Date(now), "yyyy-MM-dd HH:mm:ssxxx", {
        //     //   timeZone: timezone,
        //     // }),
        //     now: new Date(now).toISOString(),
        //     // fixme invalid time value
        //     formattedNow: formatInTimeZone(
        //       new Date(now),
        //       "yyyy-MM-dd HH:mm:ssxxx",
        //       timezone
        //     ),
        //     // formattedNow: format(now, "yyyy-MM-dd HH:mm:ssxxx", {
        //     //   timeZone: timezone,
        //     // }),
        //     zone: timezone,
        //     offset: offset / (60 * 60 * 1000),
      });
      return zoned.getTime();
    }
    zoned = add(zoned, { days: 1 });
  }

  throw new Error("Could not find next localized time");
}

// export type FindNextLocalizedTimeParams = {
//   workspaceId: string;
//   userId: string;
//   now: number;
// } & LocalTimeDelayVariantFields;

// export async function findNextLocalizedTime({
//   workspaceId,
//   userId,
//   ...rest
// }: FindNextLocalizedTimeParams): Promise<number | null> {
//   // TODO support ip lookup
//   const { latLon } = await findAllUserPropertyAssignments({
//     workspaceId,
//     userId,
//     userProperties: ["latLon"],
//   });
//   const latLonStr = typeof latLon === "string" ? latLon : undefined;
//   return findNextLocalizedTimeInner({ latLon: latLonStr, ...rest });
// }

/*


*/
