import humanizeDuration from "humanize-duration";
import { TimeUnit } from "../lib/types";

interface DurationDescriptionProps {
  durationSeconds?: number;
  timeUnit: TimeUnit;
}

export default function DurationDescription({
  durationSeconds,
  timeUnit,
}: DurationDescriptionProps) {
  const durationMilliseconds =
    {
      seconds: durationSeconds ?? 0,
      minutes: (durationSeconds ?? 0) * 60,
      hours: (durationSeconds ?? 0) * 60 * 60,
      days: (durationSeconds ?? 0) * 60 * 60 * 24,
      weeks: (durationSeconds ?? 0) * 60 * 60 * 24 * 7,
    }[timeUnit] * 1000;

  return <>{humanizeDuration(durationMilliseconds)}</>;
}
