import { Stack } from "@mui/material";
import { useMemo } from "react";

import {
  DEFAULT_DELIVERIES_TABLE_V2_PROPS,
  DeliveriesTableV2,
} from "../deliveriesTableV2";
import { BroadcastState } from "./broadcastsShared";

export default function Deliveries({ state }: { state: BroadcastState }) {
  const tableProps = useMemo(() => {
    const { columnAllowList: previousColumnAllowList, ...rest } =
      DEFAULT_DELIVERIES_TABLE_V2_PROPS;
    return {
      ...rest,
      columnAllowList: previousColumnAllowList?.filter(
        (column) => column !== "origin",
      ),
    };
  }, []);
  return (
    <Stack spacing={2} sx={{ width: "100%", height: "100%" }}>
      <DeliveriesTableV2
        {...tableProps}
        broadcastId={state.id}
        autoReloadByDefault
        reloadPeriodMs={5000}
      />
    </Stack>
  );
}
