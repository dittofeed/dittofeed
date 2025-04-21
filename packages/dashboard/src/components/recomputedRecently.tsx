import {
  AccessTime,
  Autorenew,
  CheckCircle,
  HelpOutline,
} from "@mui/icons-material";
import { CircularProgress, Tooltip } from "@mui/material";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { differenceInSeconds } from "date-fns";
import { useEffect, useMemo } from "react";

import { useComputePropertiesQuery } from "../lib/useComputePropertiesQuery";
import { TRIGGER_RECOMPUTE_PROPERTIES_MUTATION_KEY } from "../lib/useTriggerRecomputePropertiesMutation";

export function RecomputedRecentlyIcon() {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useComputePropertiesQuery(
    { step: "ComputeAssignments" }, // Fetch periods for the assignments step
    {
      refetchInterval: 5 * 1000,
    },
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

  useEffect(() => {
    // If periods are no longer stale, but were previously, invalidate user data.
    if (!isAnyStale) {
      queryClient.invalidateQueries({
        queryKey: ["users"],
      });
      queryClient.invalidateQueries({
        queryKey: ["usersCount"],
      });
    }
  }, [isAnyStale]);

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

  if (mostRecentRecomputeTime === null) {
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
    <Tooltip title="Data is up to date">
      <CheckCircle fontSize="small" />
    </Tooltip>
  );
}
