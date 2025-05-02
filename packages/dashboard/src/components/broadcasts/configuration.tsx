import { LoadingButton } from "@mui/lab";
import {
  Box,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
} from "@mui/material";
import {
  addDays,
  format,
  setHours,
  setMilliseconds,
  setMinutes,
  setSeconds,
} from "date-fns";
import { useMemo } from "react";

import { useBroadcastMutation } from "../../lib/useBroadcastMutation";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { useStartBroadcastMutation } from "../../lib/useStartBroadcastMutation";
import { getWarningStyles } from "../../lib/warningTheme";
import { BroadcastState, BroadcastStateUpdater } from "./broadcastsShared";

function getTomorrowAt8AM(currentDate: Date = new Date()): string {
  // Step 1: Calculate tomorrow's date by adding one day to the provided or current date.
  // `addDays` correctly handles month and year rollovers.
  const tomorrow = addDays(currentDate, 1);

  // Step 2: Set the time components to exactly 8:00:00.000 AM.
  // We chain the `set*` functions for clarity.
  // It's important to set minutes, seconds, and milliseconds to 0
  // to ensure the time is exactly 8:00 AM.
  let tomorrowAt8AM = setHours(tomorrow, 8); // Set hour to 8
  tomorrowAt8AM = setMinutes(tomorrowAt8AM, 0); // Set minutes to 0
  tomorrowAt8AM = setSeconds(tomorrowAt8AM, 0); // Set seconds to 0
  tomorrowAt8AM = setMilliseconds(tomorrowAt8AM, 0); // Set milliseconds to 0

  // Step 3: Format the resulting date object into the desired string format 'yyyy-MM-dd HH:mm'.
  // 'yyyy' for 4-digit year, 'MM' for 2-digit month, 'dd' for 2-digit day,
  // 'HH' for 2-digit hour (00-23), 'mm' for 2-digit minute.
  const formattedTimestamp = format(tomorrowAt8AM, "yyyy-MM-dd HH:mm");

  // Return the formatted string.
  return formattedTimestamp;
}

export default function Configuration({
  state,
  updateState,
}: {
  state: BroadcastState;
  updateState: BroadcastStateUpdater;
}) {
  const { data: broadcast } = useBroadcastQuery(state.id);
  const { mutate: startBroadcast, isPending } = useStartBroadcastMutation();
  const { mutate: updateBroadcast } = useBroadcastMutation(state.id);
  const theme = useTheme();
  const errors = useMemo(() => {
    const e: string[] = [];
    if (!broadcast?.messageTemplateId) {
      e.push("You must select a message template.");
    }
    if (!broadcast?.subscriptionGroupId) {
      e.push("You must select a subscription group.");
    }
    return e;
  }, [broadcast]);
  if (!broadcast) {
    return null;
  }
  const disabled = broadcast.status !== "Draft" || errors.length !== 0;
  const scheduledStatus: "scheduled" | "immediate" = broadcast.scheduledAt
    ? "scheduled"
    : "immediate";
  return (
    <Stack spacing={2} sx={{ maxWidth: 600 }}>
      {errors.length > 0 && (
        <Box sx={getWarningStyles(theme)}>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Box>
      )}
      <ToggleButtonGroup
        value={scheduledStatus}
        exclusive
        onChange={(_, newValue) => {
          updateBroadcast({
            scheduledAt: newValue === "scheduled" ? getTomorrowAt8AM() : null,
          });
        }}
      >
        <ToggleButton value="immediate">Immediate</ToggleButton>
        <ToggleButton value="scheduled">Scheduled</ToggleButton>
      </ToggleButtonGroup>
      <LoadingButton
        variant="outlined"
        color="primary"
        loading={isPending}
        disabled={disabled}
        onClick={() => {
          startBroadcast(
            { broadcastId: state.id },
            {
              onSuccess: () => {
                updateState((draft) => {
                  draft.step = "REVIEW";
                });
              },
            },
          );
        }}
      >
        Start Broadcast
      </LoadingButton>
    </Stack>
  );
}
