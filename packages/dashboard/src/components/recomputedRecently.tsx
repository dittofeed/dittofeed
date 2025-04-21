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

export function RecomputedRecentlyIcon() {
  const { data, isPending, isError } = useComputePropertiesQuery(
    { step: "ComputeAssignments" }, // Fetch periods for the assignments step
  );

  const { mostRecentRecomputeTime, isAnyStale } = useMemo(() => {
    if (!data?.periods || data.periods.length === 0) {
      return { mostRecentRecomputeTime: null, isAnyStale: false };
    }

    let maxTime: Date | null = null;
    let anyStale = false;
    const now = new Date();

    for (const p of data.periods) {
      if (!p.lastRecomputed) continue;
      const computedTime = new Date(p.lastRecomputed);
      if (maxTime === null || computedTime > maxTime) {
        maxTime = computedTime;
      }
      if (differenceInSeconds(now, computedTime) >= 30) {
        anyStale = true;
      }
    }
    return { mostRecentRecomputeTime: maxTime, isAnyStale: anyStale };
  }, [data]);

  const secondsSinceMostRecent = useMemo(() => {
    if (!mostRecentRecomputeTime) {
      return null;
    }
    return differenceInSeconds(new Date(), mostRecentRecomputeTime);
  }, [mostRecentRecomputeTime]);

  const roundedSecondsSinceMostRecent = useMemo(() => {
    if (secondsSinceMostRecent === null) {
      return null;
    }
    return Math.round(secondsSinceMostRecent);
  }, [secondsSinceMostRecent]);

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

  if (
    mostRecentRecomputeTime === null ||
    roundedSecondsSinceMostRecent === null
  ) {
    return (
      <Tooltip title="Not computed yet">
        <HelpOutline fontSize="small" />
      </Tooltip>
    );
  }

  if (isAnyStale) {
    return (
      <Tooltip title="Last computed more than 30 seconds ago">
        <AccessTime fontSize="small" />
      </Tooltip>
    );
  }

  return (
    <Tooltip title="Last computed more than 30 seconds ago">
      <Refresh fontSize="small" />
    </Tooltip>
  );
}
