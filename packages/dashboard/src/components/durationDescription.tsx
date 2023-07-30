import humanizeDuration from "humanize-duration";
import { TimeUnit } from "../lib/types";

export interface DurationDescriptionProps {
  durationSeconds?: number;
}

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

export function nearestTimeUnit(seconds?: number): TimeUnit {
  if (!seconds) {
    return "days";
  }
  for (const unit of timeUnitOrder) {
    const conversion = timeUnitConversion[unit];
    if ((seconds / conversion) % 1 === 0) {
      return unit;
    }
  }
  throw new Error("should by default select seconds from loop above");
}

export function durationDescription({
  durationSeconds,
}: DurationDescriptionProps): string {
  if (durationSeconds === 0 || !durationSeconds) {
    return "0 days";
  }
  const durationMilliseconds = durationSeconds * 1000;
  return humanizeDuration(durationMilliseconds);
}

export default function DurationDescription(props: DurationDescriptionProps) {
  return <>{durationDescription(props)}</>;
}
