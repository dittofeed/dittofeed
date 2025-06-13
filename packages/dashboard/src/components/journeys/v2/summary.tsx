import { Stack } from "@mui/material";

import { useJourneyQuery } from "../../../lib/useJourneyQuery";
import {
  DEFAULT_ALLOWED_COLUMNS,
  DEFAULT_DELIVERIES_TABLE_V2_PROPS,
  DeliveriesTableV2,
} from "../../deliveriesTableV2";
import { SubtleHeader } from "../../headers";
import { useJourneyV2Context } from "./shared";

export default function JourneyV2Summary() {
  const { state } = useJourneyV2Context();
  const { data: journey } = useJourneyQuery(state.id);
  if (!journey) {
    return null;
  }
  return (
    <Stack sx={{ padding: 2 }}>
      <SubtleHeader>Deliveries</SubtleHeader>
      <DeliveriesTableV2
        {...DEFAULT_DELIVERIES_TABLE_V2_PROPS}
        columnAllowList={DEFAULT_ALLOWED_COLUMNS.filter((c) => c !== "origin")}
        journeyId={state.id}
        autoReloadByDefault
        reloadPeriodMs={10000}
      />
    </Stack>
  );
}
