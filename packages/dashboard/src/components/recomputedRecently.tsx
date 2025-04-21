import {
  AccessTime,
  Autorenew,
  HelpOutline,
  Refresh,
} from "@mui/icons-material";
import { CircularProgress, Tooltip } from "@mui/material";
import { useIsMutating } from "@tanstack/react-query";
import { differenceInSeconds } from "date-fns";
import { useMemo } from "react";

import { useComputePropertiesQuery } from "../lib/useComputePropertiesQuery";
import { TRIGGER_RECOMPUTE_PROPERTIES_MUTATION_KEY } from "../lib/useTriggerRecomputePropertiesMutation";

export function RecomputedRecentlyIcon({
  type,
  id,
}: {
  type: "Segment" | "UserProperty";
  id: string;
}) {
  const { data, isPending, isError } = useComputePropertiesQuery({
    step: "ComputeAssignments",
  });

  const period = useMemo(
    () => data?.periods.find((p) => p.type === type && p.id === id),
    [data, type, id],
  );
  const lastRecomputed = useMemo(
    () => (period ? new Date(period.lastRecomputed) : undefined),
    [period],
  );

  const secondsSinceRecompute = useMemo(() => {
    if (!lastRecomputed) {
      return null;
    }
    return differenceInSeconds(new Date(), lastRecomputed);
  }, [lastRecomputed]);

  const roundedSecondsSinceRecompute = useMemo(() => {
    if (secondsSinceRecompute === null) {
      return null;
    }
    return Math.round(secondsSinceRecompute);
  }, [secondsSinceRecompute]);

  const isRecomputing = useIsMutating({
    mutationKey: TRIGGER_RECOMPUTE_PROPERTIES_MUTATION_KEY,
  });

  if (isRecomputing > 0) {
    return (
      <Tooltip title="Recomputing...">
        <Autorenew
          fontSize="small"
          sx={{
            animation: "spin 2s linear infinite",
            "@keyframes spin": {
              "0%": {
                transform: "rotate(0deg)",
              },
              "100%": {
                transform: "rotate(360deg)",
              },
            },
          }}
        />
      </Tooltip>
    );
  }

  if (isPending) {
    return <CircularProgress size={20} />;
  }

  if (isError) {
    return null;
  }

  if (secondsSinceRecompute === null || roundedSecondsSinceRecompute === null) {
    return (
      <Tooltip title="Not computed yet">
        <HelpOutline fontSize="small" />
      </Tooltip>
    );
  }

  if (secondsSinceRecompute < 30) {
    return (
      <Tooltip title={`Recomputed ${roundedSecondsSinceRecompute} seconds ago`}>
        <Refresh fontSize="small" />
      </Tooltip>
    );
  }

  return (
    <Tooltip title={`Recomputed ${roundedSecondsSinceRecompute} seconds ago`}>
      <AccessTime fontSize="small" />
    </Tooltip>
  );
}
