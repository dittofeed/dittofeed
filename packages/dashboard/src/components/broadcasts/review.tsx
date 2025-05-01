import { Stack } from "@mui/material";

import {
  DEFAULT_DELIVERIES_TABLE_V2_PROPS,
  DeliveriesTableV2,
} from "../deliveriesTableV2";
import { BroadcastState } from "./broadcastsShared";

// const ReviewTabsEnum = {
//   Delivered: "Delivered",
// } as const;

// type ReviewTabs = keyof typeof ReviewTabsEnum;

// interface ReviewTabsState {
//   type: typeof ReviewTabsEnum.Delivered;
// }

// type TabsState = ReviewTabsState;

export default function Review({ state }: { state: BroadcastState }) {
  return (
    <Stack spacing={2}>
      <DeliveriesTableV2
        {...DEFAULT_DELIVERIES_TABLE_V2_PROPS}
        broadcastId={state.id}
        autoReloadByDefault
        reloadPeriodMs={5000}
      />
    </Stack>
  );
}
