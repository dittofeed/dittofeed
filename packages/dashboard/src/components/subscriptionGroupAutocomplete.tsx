import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import { ChannelType } from "isomorphic-lib/src/types";
import { useEffect, useMemo } from "react";

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
  selectInitialDefault,
}: {
  subscriptionGroupId?: string;
  disabled?: boolean;
  channel?: ChannelType;
  handler: SubscriptionGroupChangeHandler;
  disableClearable?: boolean;
  selectInitialDefault?: boolean;
}) {
  const { data: queryData, isLoading } = useSubscriptionGroupsQuery();

  const subscriptionGroupItems = useMemo(() => {
    const groups = queryData?.subscriptionGroups;
    if (!groups) {
      return [];
    }
    if (!channel) {
      return groups;
    }
    return groups.filter((sg) => sg.channel === channel);
  }, [queryData, channel]);

  const subscriptionGroup = useMemo(() => {
    return (
      subscriptionGroupItems.find(
        (sg: SimpleSubscriptionGroup) => sg.id === subscriptionGroupId,
      ) ?? null
    );
  }, [subscriptionGroupItems, subscriptionGroupId]);

  // When data loads and selectInitialDefault is true, select the first item
  useEffect(() => {
    const firstItem = subscriptionGroupItems[0];
    if (
      selectInitialDefault &&
      !subscriptionGroupId &&
      firstItem &&
      !isLoading &&
      subscriptionGroup === null
    ) {
      handler(firstItem);
    }
  }, [
    subscriptionGroupItems,
    subscriptionGroupId,
    selectInitialDefault,
    isLoading,
    subscriptionGroup,
  ]);

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
