import { useSubscriptionGroupsQuery } from "../../lib/useSubscriptionGroupsQuery";
import { SubscriptionGroupAutocompleteV2 } from "../subscriptionGroupAutocomplete";
import { BroadcastState, BroadcastStateUpdater } from "./broadcastsShared";

export default function Recipients({
  state,
  updateState,
}: {
  state: BroadcastState;
  updateState: BroadcastStateUpdater;
}) {
  return (
    <div>
      <SubscriptionGroupAutocompleteV2
        channel={}
        subscriptionGroupId={}
        handler={(sg) => {}}
      />
    </div>
  );
}
