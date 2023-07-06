import humanizeDuration from "humanize-duration";

export function durationDescription(durationSeconds?: number) {
  return humanizeDuration((durationSeconds ?? 0) * 1000);
}

export default function DurationDescription({
  durationSeconds,
}: {
  durationSeconds?: number;
}) {
  return <>{durationDescription(durationSeconds)}</>;
}
