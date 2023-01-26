import humanizeDuration from "humanize-duration";

export default function DurationDescription({
  durationSeconds,
}: {
  durationSeconds?: number;
}) {
  return <>{humanizeDuration((durationSeconds ?? 0) * 1000)}</>;
}
