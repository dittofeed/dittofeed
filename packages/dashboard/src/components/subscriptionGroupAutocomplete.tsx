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
  subscriptionGroup: SubscriptionGroupResource | null
) => void;

export default function SubscriptionGroupAutocomplete({
  channel,
  value,
  handler,
}: {
  value: SubscriptionGroupResource;
  channel: ChannelType;
  handler: SubscriptionGroupChangeHandler;
}) {
  const { subscriptionGroups } = useAppStorePick(["subscriptionGroups"]);
  const subscriptionGroupItems = subscriptionGroups.filter(
    (sg) => sg.channel === channel
  );
  return (
    <Autocomplete
      value={value}
      options={subscriptionGroupItems}
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
