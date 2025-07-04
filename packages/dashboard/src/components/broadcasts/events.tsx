import { TimeOptionId, UserEventsTable } from "../userEventsTable";
import { BroadcastState } from "./broadcastsShared";

export default function Events({ state }: { state: BroadcastState }) {
  return (
    <UserEventsTable
      broadcastId={state.id}
      defaultTimeOption={TimeOptionId.LastHour}
    />
  );
}
