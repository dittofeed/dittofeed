import { Stack, Typography } from "@mui/material";
import { useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { useBroadcastMutation } from "../../lib/useBroadcastMutation";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { BroadcastState } from "./broadcastsShared";

export default function Content({ state }: { state: BroadcastState }) {
  const { workspace } = useAppStorePick(["workspace"]);
  const broadcastQuery = useBroadcastQuery(state.id);
  const broadcastMutation = useBroadcastMutation(state.id);
  const [selectExistingSegment, setSelectExistingSegment] = useState<
    "existing" | "new" | null
  >(null);
  return (
    <Stack spacing={2}>
      <Typography variant="caption" sx={{ mb: -1 }}>
        Message Template
      </Typography>
    </Stack>
  );
}
