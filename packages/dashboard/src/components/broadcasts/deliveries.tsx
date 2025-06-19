import { Stack } from "@mui/material";

import {
  DEFAULT_DELIVERIES_TABLE_V2_PROPS,
  DeliveriesTableV2,
} from "../deliveriesTableV2";
import { BroadcastState } from "./broadcastsShared";

export default function Deliveries({ state }: { state: BroadcastState }) {
  return (
    <Stack spacing={2} sx={{ width: "100%", height: "100%" }}>
      <DeliveriesTableV2
        {...DEFAULT_DELIVERIES_TABLE_V2_PROPS}
        broadcastId={state.id}
        autoReloadByDefault
        reloadPeriodMs={5000}
      />
    </Stack>
  );
}
