import humanizeDuration from "humanize-duration";

import { TimeUnit } from "../lib/types";

const timeUnitOrder: TimeUnit[] = [
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
];

export const timeUnitConversion: Record<TimeUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 60 * 60,
  days: 60 * 60 * 24,
  weeks: 60 * 60 * 24 * 7,
};

const EPSILON = 1e-10;

export function nearestTimeUnit(seconds?: number): TimeUnit {
  if (!seconds) {
    return "days";
  }
  for (const unit of timeUnitOrder) {
    const conversion = timeUnitConversion[unit];
    const numberOfUnits = seconds / conversion;
    if (Math.abs(numberOfUnits - Math.round(numberOfUnits)) < EPSILON) {
      return unit;
    }
  }
  throw new Error(
    `should by default select seconds from loop above: ${seconds}`,
  );
}

export interface DurationDescriptionProps {
  durationSeconds?: number;
}

export function durationDescription(
  durationSeconds: number | undefined,
): string {
  if (durationSeconds === 0 || !durationSeconds) {
    return "0 days";
  }
  const durationMilliseconds = durationSeconds * 1000;
  return humanizeDuration(durationMilliseconds, { largest: 2 });
}

export default function DurationDescription({
  durationSeconds,
}: DurationDescriptionProps) {
  return <>{durationDescription(durationSeconds)}</>;
}
