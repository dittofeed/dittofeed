import { LoadingButton } from "@mui/lab";
import { Box, Stack, useTheme } from "@mui/material";
import { useMemo } from "react";

import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { useStartBroadcastMutation } from "../../lib/useStartBroadcastMutation";
import { getWarningStyles } from "../../lib/warningTheme";
import { BroadcastState, BroadcastStateUpdater } from "./broadcastsShared";

export default function Configuration({
  state,
  updateState,
}: {
  state: BroadcastState;
  updateState: BroadcastStateUpdater;
}) {
  const { data: broadcast } = useBroadcastQuery(state.id);
  const { mutate: startBroadcast, isPending } = useStartBroadcastMutation();
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
