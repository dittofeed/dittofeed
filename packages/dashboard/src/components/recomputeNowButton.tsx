import { Autorenew } from "@mui/icons-material";
import { Button, Stack, Tooltip, Typography } from "@mui/material";
import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useState } from "react";

import { useComputedPropertyPeriodsQuery } from "../lib/useComputedPropertyPeriodsQuery";
import { useTriggerRecomputePropertiesMutation } from "../lib/useTriggerRecomputePropertiesMutation";
import { greyButtonStyle } from "./greyButtonStyle";

// Give up waiting for fresh results after this long; the scheduler will still
// pick the request up, we just stop showing the spinner.
const MAX_WAIT_MS = 60 * 1000;

const spin = {
  animation: "recompute-spin 1s linear infinite",
  "@keyframes recompute-spin": {
    "0%": { transform: "rotate(0deg)" },
    "100%": { transform: "rotate(360deg)" },
  },
};

// "Recompute now" plus how fresh the data is. Recomputation is
// workspace-wide; pass a segmentId to show that segment's freshness.
export function RecomputeNowButton({ segmentId }: { segmentId?: string }) {
  const [requestedAt, setRequestedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const trigger = useTriggerRecomputePropertiesMutation();

  const waiting = requestedAt !== null && now - requestedAt < MAX_WAIT_MS;

  const { data: lastRecomputed } = useComputedPropertyPeriodsQuery(
    { step: "ComputeAssignments" },
    {
      select: (d) => {
        const periods = segmentId
          ? d.periods.filter((p) => p.id === segmentId)
          : d.periods;
        const times = periods
          .map((p) => new Date(p.lastRecomputed).getTime())
          .filter((t) => !Number.isNaN(t));
        return times.length > 0 ? Math.max(...times) : null;
      },
      refetchInterval: waiting ? 2000 : 15000,
    },
  );

  // Tick so "updated 5s ago" stays current.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Done once results newer than the request arrive.
  useEffect(() => {
    if (
      requestedAt !== null &&
      lastRecomputed &&
      lastRecomputed >= requestedAt
    ) {
      setRequestedAt(null);
    }
  }, [lastRecomputed, requestedAt]);

  const busy = trigger.isPending || waiting;
  let status = "Not computed yet";
  if (busy) {
    status = "Recomputing…";
  } else if (lastRecomputed) {
    status = `Updated ${formatDistanceToNowStrict(lastRecomputed, {
      addSuffix: true,
    })}`;
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2" color="text.secondary" noWrap>
        {status}
      </Typography>
      <Tooltip title="Recompute segments and user properties now instead of waiting for the next scheduled run">
        <span>
          <Button
            variant="contained"
            disableElevation
            disabled={busy}
            startIcon={<Autorenew sx={busy ? spin : undefined} />}
            onClick={() =>
              trigger.mutate(
                {},
                { onSuccess: () => setRequestedAt(Date.now()) },
              )
            }
            sx={greyButtonStyle}
          >
            Recompute now
          </Button>
        </span>
      </Tooltip>
    </Stack>
  );
}
