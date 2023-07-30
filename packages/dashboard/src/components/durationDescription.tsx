import humanizeDuration from "humanize-duration";
import { TimeUnit } from "../lib/types";

export interface DurationDescriptionProps {
  durationSeconds?: number;
  timeUnit: TimeUnit;
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

export function nearestTimeUnit(time?: number): TimeUnit {
  console.log("time", time);
  if (!time) {
    console.log("time early return");
    return "days";
  }
  for (const unit of timeUnitOrder) {
    const conversion = timeUnitConversion[unit];
    if ((time / conversion) % 1 === 0) {
      console.log("time loop return", unit);
      return unit;
    }
  }
  throw new Error("should by default select seconds from loop above");
}

export function durationDescription({
  durationSeconds,
  timeUnit,
}: DurationDescriptionProps): string {
  if (durationSeconds === 0 || !durationSeconds) {
    return "0 days";
  }

  const durationMilliseconds =
    durationSeconds * 1000 * timeUnitConversion[timeUnit];
  return humanizeDuration(durationMilliseconds);
}

export default function DurationDescription(props: DurationDescriptionProps) {
  return <>{durationDescription(props)}</>;
}
