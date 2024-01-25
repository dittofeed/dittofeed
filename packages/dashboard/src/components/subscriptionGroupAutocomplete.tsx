import { Autocomplete, TextField } from "@mui/material";
import {
  ChannelType,
  SubscriptionGroupResource,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "../lib/appStore";

function getSubscriptionGroupLabel(sg: SubscriptionGroupResource) {
  return sg.name;
}

export type SubscriptionGroupChangeHandler = (
  subscriptionGroup: SubscriptionGroupResource | null,
) => void;

export default function SubscriptionGroupAutocomplete({
  channel,
  subscriptionGroupId,
  disabled,
  handler,
}: {
  subscriptionGroupId?: string;
  disabled?: boolean;
  channel: ChannelType;
  handler: SubscriptionGroupChangeHandler;
}) {
  const { subscriptionGroups } = useAppStorePick(["subscriptionGroups"]);
  const subscriptionGroupItems = subscriptionGroups.filter(
    (sg) => sg.channel === channel,
  );
  const subscriptionGroup =
    subscriptionGroupItems.find((sg) => sg.id === subscriptionGroupId) ?? null;

  return (
    <Autocomplete
      value={subscriptionGroup}
      options={subscriptionGroupItems}
      disabled={disabled}
      getOptionLabel={getSubscriptionGroupLabel}
      onChange={(_event, sg) => {
        handler(sg);
      }}
      renderInput={(params) => (
        <TextField {...params} label="Subscription Group" variant="outlined" />
      )}
    />
  );
}
