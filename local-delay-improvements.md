# Local Delay Improvements

See [AGENTS.md](AGENTS.md) for guidance on general coding tips.

## Fix for Apparent Bug

According to a user, there's a bug in our local delay implementation for `DelayNode`'s.

### Original Bug Report Message

I was working on implementing something using the localized delay and I think theres a bug in the implementation.

https://github.com/dittofeed/dittofeed/blob/main/packages/backend-lib/src/dates.ts#L80

findNextLocalizedTimeInner gets passed a hard coded hour of 5 and doesn't get any minutes or days of the week passed to the function, which means everything is delayed for every day of the week for 5 am.

I wasn't able to open a pr against the repo, happy to open an issue on github if thats a better resolution path, but i think the fixes are along these lines:

packages/backend-lib/src/dates.ts

```typescript
import { add, getUnixTime } from "date-fns";
import { getTimezoneOffset, zonedTimeToUtc } from "date-fns-tz";
import { find as findTz } from "geo-tz";

import logger from "./logger";
import { AllowedDayIndices, LocalTimeDelayVariantFields, UserWorkflowTrackEvent } from "./types";
import { getTrackEventsById } from "./userEvents";
import {
  findAllUserPropertyAssignments,
  findAllUserPropertyAssignmentsById,
} from "./userProperties";

const DEFAULT_TIMEZONE = "UTC";
const EVERY_DAY_IN_WEEK = new Set<AllowedDayIndices>([0, 1, 2, 3, 4, 5, 6]);

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
}: {
  latLon?: string;
  now: number;
  hour: number;
  minute?: number;
  allowedDaysOfWeek?: Set<AllowedDayIndices>;
}): number {
  const timezone =
    typeof latLon === "string" ? getTimezone({ latLon }) : DEFAULT_TIMEZONE;
  const offset = getTimezoneOffset(timezone, now);
  const zoned = offset + now;

  let adjusted = new Date(zoned);
  adjusted.setUTCHours(hour, minute, 0, 0);

  const allowedDays = allowedDaysOfWeek
    ? new Set(allowedDaysOfWeek)
    : EVERY_DAY_IN_WEEK;

  for (let i = 0; i < 8; i++) {
    const local = adjusted.getTime() - offset;
    if (
      adjusted.getTime() > zoned &&
      allowedDays.has(new Date(local).getUTCDay())
    ) {
      return local;
    }
    adjusted = add(adjusted, { days: 1 });
  }

  throw new Error("Could not find next localized time");
}

export async function findNextLocalizedTime({
  workspaceId,
  userId,
  now,
  hour,
  minute = 0,
  allowedDaysOfWeek = EVERY_DAY_IN_WEEK,
}: {
  workspaceId: string;
  userId: string;
  now: number;
  hour: number;
  minute?: number;
  allowedDaysOfWeek?: Set<AllowedDayIndices>;
}): Promise<number> {
  const { latLon } = await findAllUserPropertyAssignments({
    workspaceId,
    userId,
    userProperties: ["latLon"],
  });
  return findNextLocalizedTimeInner({
    latLon: typeof latLon === "string" ? latLon : undefined,
    now,
    hour,
    minute,
    allowedDaysOfWeek,
  });
}
packages/backend-lib/src/journeys/userWorkflow.ts
          case DelayVariantType.LocalTime: {
            const now = Date.now();
            const nextTime = await findNextLocalizedTime({
              workspaceId,
              userId,
              now,
              hour: currentNode.variant.hour,
              minute: currentNode.variant.minute,
              allowedDaysOfWeek: currentNode.variant.allowedDaysOfWeek,
            });
            delay = nextTime - now;
            break;
          }
```

### Steps

1. Assess the user's claims, is there really a bug here?
2. If there is a bug, summarize it and continue.
3. If there is a bug, reproduce it in packages/backend-lib/src/dates.test.ts. Otherwise, write a test demonstrating its non existence.
4. Assuming there is a bug, fix it in packages/backend-lib/src/dates.ts.