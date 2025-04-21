import { useMemo } from "react";

import { useComputePropertiesQuery } from "../lib/useComputePropertiesQuery";

export function RecomputedRecentlyIcon({
  type,
  id,
}: {
  type: "Segment" | "UserProperty";
  id: string;
}) {
  const { data, isPending } = useComputePropertiesQuery({
    step: "ComputeAssignments",
  });

  const period = useMemo(
    () => data?.periods.find((p) => p.type === type && p.id === id),
    [data, type, id],
  );
  const lastRecomputed = period ? new Date(period.lastRecomputed) : undefined;

  // FIXME if pending, show a spinner
  // FIXME if error, return null
  // FIXME if no data return icon representing that the data has never been recomputed
  // FIXME if updated in last 30 seconds show an icon representing that the data is fresh
  // FIXME if updated more than 30 seconds ago, show an icon representing that the data is stale
  return <div>Recomputed Recently</div>;
}
