import { UserEventsTable } from "../userEventsTable";
import { BroadcastState } from "./broadcastsShared";

export default function Events({ state }: { state: BroadcastState }) {
  return <UserEventsTable broadcastId={state.id} />;
}
