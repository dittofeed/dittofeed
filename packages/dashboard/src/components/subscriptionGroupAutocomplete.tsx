import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import { ChannelType } from "isomorphic-lib/src/types";
import { useMemo } from "react";

import { useAppStorePick } from "../lib/appStore";
import { useSubscriptionGroupsQuery } from "../lib/useSubscriptionGroupsQuery";

// Define a simpler type based on observed/inferred data structure
interface SimpleSubscriptionGroup {
  id: string;
  name: string;
  channel: ChannelType;
}

function getSubscriptionGroupLabel(sg: SimpleSubscriptionGroup) {
  return sg.name;
}

export type SubscriptionGroupChangeHandler = (
  subscriptionGroup: SimpleSubscriptionGroup | null,
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

export function SubscriptionGroupAutocompleteV2({
  channel,
  subscriptionGroupId,
  disabled,
  handler,
  disableClearable,
}: {
  subscriptionGroupId?: string;
  disabled?: boolean;
  channel: ChannelType;
  handler: SubscriptionGroupChangeHandler;
  disableClearable?: boolean;
}) {
  const { data: queryData, isLoading } = useSubscriptionGroupsQuery();

  const subscriptionGroupItems: SimpleSubscriptionGroup[] = useMemo(() => {
    const groups = queryData?.subscriptionGroups;
    if (!groups) {
      return [];
    }
    return groups.filter(
      (sg: SimpleSubscriptionGroup) => sg.channel === channel,
    );
  }, [queryData, channel]);

  const subscriptionGroup = useMemo(() => {
    return (
      subscriptionGroupItems.find(
        (sg: SimpleSubscriptionGroup) => sg.id === subscriptionGroupId,
      ) ?? null
    );
  }, [subscriptionGroupItems, subscriptionGroupId]);

  return (
    <Autocomplete
      value={subscriptionGroup}
      options={subscriptionGroupItems}
      disabled={disabled || isLoading}
      disableClearable={disableClearable}
      getOptionLabel={getSubscriptionGroupLabel}
      onChange={(_event, sg) => {
        handler(sg);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Subscription Group"
          variant="outlined"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {isLoading ? (
                  <CircularProgress color="inherit" size={20} />
                ) : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
