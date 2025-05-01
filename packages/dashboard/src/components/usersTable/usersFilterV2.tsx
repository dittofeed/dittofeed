import { Chip, Stack, SxProps, Theme, useTheme } from "@mui/material";
import React from "react";

import { useSegmentsQuery } from "../../lib/useSegmentResourcesQuery";
import { useSubscriptionGroupsQuery } from "../../lib/useSubscriptionGroupsQuery";
import { useUserPropertyResourcesQuery } from "../../lib/useUserPropertyResourcesQuery";
import {
  removeSegment,
  removeSubscriptionGroup,
  removeUserProperty,
  UserFilterState,
  UserFilterUpdater,
} from "./userFiltersState";
import { UsersFilterSelectorV2 } from "./usersFilterSelectorV2";

export function UsersFilterV2({
  state,
  updater,
}: {
  state: UserFilterState;
  updater: UserFilterUpdater;
}) {
  const userPropertiesQuery = useUserPropertyResourcesQuery();
  const segmentsQuery = useSegmentsQuery();
  const subscriptionGroupsQuery = useSubscriptionGroupsQuery();

  const joinedFilterSegments: {
    id: string;
    name: string;
  }[] = React.useMemo(() => {
    if (segmentsQuery.status !== "success") {
      return [];
    }

    const segments = segmentsQuery.data.segments || [];
    const segmentNames = segments.reduce(
      (acc: Map<string, string>, segment) => {
        acc.set(segment.id, segment.name);
        return acc;
      },
      new Map<string, string>(),
    );

    return Array.from(state.segments).flatMap((id) => {
      const name = segmentNames.get(id);
      if (!name) {
        return [];
      }
      return { id, name };
    });
  }, [state.segments, segmentsQuery]);

  const joinedUserPropertyFilters: {
    id: string;
    name: string;
    values: string[];
  }[] = React.useMemo(() => {
    if (userPropertiesQuery.status !== "success") {
      return [];
    }

    const userProperties = userPropertiesQuery.data.userProperties || [];
    const userPropertyNames = userProperties.reduce(
      (acc: Map<string, string>, up) => {
        acc.set(up.id, up.name);
        return acc;
      },
      new Map<string, string>(),
    );

    return Array.from(state.userProperties).flatMap(([id, values]) => {
      const name = userPropertyNames.get(id);
      if (!name) {
        return [];
      }
      return { id, name, values: Array.from(values) };
    });
  }, [state.userProperties, userPropertiesQuery]);

  const joinedSubscriptionGroups: {
    id: string;
    name: string;
  }[] = React.useMemo(() => {
    if (subscriptionGroupsQuery.status !== "success") {
      return [];
    }

    const subscriptionGroups =
      subscriptionGroupsQuery.data.subscriptionGroups || [];
    const subscriptionGroupNames = subscriptionGroups.reduce(
      (acc: Map<string, string>, sg) => {
        acc.set(sg.id, sg.name);
        return acc;
      },
      new Map<string, string>(),
    );

    return Array.from(state.subscriptionGroups).flatMap((id) => {
      const name = subscriptionGroupNames.get(id);
      if (!name) {
        return [];
      }
      return { id, name };
    });
  }, [state.subscriptionGroups, subscriptionGroupsQuery]);

  const theme = useTheme();

  // Define common chip styles to match DeliveriesFilter grayscale look
  const chipSx: SxProps<Theme> = {
    borderRadius: "4px",
    color: theme.palette.grey[700],
    backgroundColor: theme.palette.grey[200],
    "& .MuiChip-deleteIcon": {
      color: theme.palette.grey[500],
      "&:hover": {
        color: theme.palette.grey[700],
      },
    },
    margin: theme.spacing(0.5),
    height: theme.spacing(4),
    "& .MuiChip-label": {
      fontWeight: 500,
    },
  };

  return (
    <Stack spacing={1} direction="row" alignItems="center" flexWrap="wrap">
      {joinedUserPropertyFilters.flatMap((property) => (
        <Chip
          key={property.id}
          sx={chipSx}
          label={`${property.name} = ${property.values
            .map((value) => `"${value}"`)
            .join(" OR ")}`}
          onDelete={() => removeUserProperty(updater, property.id)}
        />
      ))}
      {joinedFilterSegments.map((segment) => (
        <Chip
          key={segment.id}
          sx={chipSx}
          disabled={state.staticSegments.has(segment.id)}
          label={`User in ${segment.name}`}
          onDelete={() => removeSegment(updater, segment.id)}
        />
      ))}
      {joinedSubscriptionGroups.map((sg) => (
        <Chip
          key={sg.id}
          sx={chipSx}
          disabled={state.staticSubscriptionGroups.has(sg.id)}
          label={`User subscribed to ${sg.name}`}
          onDelete={() => removeSubscriptionGroup(updater, sg.id)}
        />
      ))}
      <UsersFilterSelectorV2 state={state} updater={updater} />
    </Stack>
  );
}
