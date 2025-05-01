import { Box, Button, Stack, useTheme } from "@mui/material";
import { useMemo } from "react";

import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { getWarningStyles } from "../../lib/warningTheme";
import { BroadcastState } from "./broadcastsShared";

export default function Configuration({ state }: { state: BroadcastState }) {
  const { data: broadcast } = useBroadcastQuery(state.id);
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
      <Button variant="outlined" color="primary">
        Start Broadcast
      </Button>
    </Stack>
  );
}
