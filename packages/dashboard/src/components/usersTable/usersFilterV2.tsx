import { Chip, Stack, SxProps, Theme, useTheme } from "@mui/material";
import React from "react";

import { useSegmentsQuery } from "../../lib/useSegmentResourcesQuery";
import { useSubscriptionGroupsResourcesQuery } from "../../lib/useSubscriptionGroupsResourcesQuery";
import { useUserPropertyResourcesQuery } from "../../lib/useUserPropertyResourcesQuery";
import { UsersFilterSelectorV2 } from "./usersFilterSelectorV2";

export interface UsersFilterV2Props {
  // State (read-only)
  userProperties: Map<string, Set<string>>;
  segments: Set<string>;
  staticSegments: Set<string>;
  subscriptionGroups: Set<string>;
  staticSubscriptionGroups: Set<string>;

  // Actions
  onRemoveSegment: (id: string) => void;
  onRemoveSubscriptionGroup: (id: string) => void;
  onRemoveUserProperty: (id: string) => void;
  onAddSegment: (id: string) => void;
  onAddSubscriptionGroup: (id: string) => void;
  onAddUserProperty: (propertyId: string, value: string) => void;
}

export function UsersFilterV2({
  userProperties,
  segments,
  staticSegments,
  subscriptionGroups,
  staticSubscriptionGroups,
  onRemoveSegment,
  onRemoveSubscriptionGroup,
  onRemoveUserProperty,
  onAddSegment,
  onAddSubscriptionGroup,
  onAddUserProperty,
}: UsersFilterV2Props) {
  const userPropertiesQuery = useUserPropertyResourcesQuery();
  const segmentsQuery = useSegmentsQuery();
  const subscriptionGroupsQuery = useSubscriptionGroupsResourcesQuery();

  const joinedFilterSegments: {
    id: string;
    name: string;
  }[] = React.useMemo(() => {
    if (segmentsQuery.status !== "success") {
      return [];
    }

    const segmentsList = segmentsQuery.data.segments || [];
    const segmentNames = segmentsList.reduce(
      (acc: Map<string, string>, segment) => {
        acc.set(segment.id, segment.name);
        return acc;
      },
      new Map<string, string>(),
    );

    return Array.from(segments).flatMap((id) => {
      const name = segmentNames.get(id);
      if (!name) {
        return [];
      }
      return { id, name };
    });
  }, [segments, segmentsQuery]);

  const joinedUserPropertyFilters: {
    id: string;
    name: string;
    values: string[];
  }[] = React.useMemo(() => {
    if (userPropertiesQuery.status !== "success") {
      return [];
    }

    const userPropertiesList = userPropertiesQuery.data.userProperties || [];
    const userPropertyNames = userPropertiesList.reduce(
      (acc: Map<string, string>, up) => {
        acc.set(up.id, up.name);
        return acc;
      },
      new Map<string, string>(),
    );

    return Array.from(userProperties).flatMap(([id, values]) => {
      const name = userPropertyNames.get(id);
      if (!name) {
        return [];
      }
      return { id, name, values: Array.from(values) };
    });
  }, [userProperties, userPropertiesQuery]);

  const joinedSubscriptionGroups: {
    id: string;
    name: string;
  }[] = React.useMemo(() => {
    if (subscriptionGroupsQuery.status !== "success") {
      return [];
    }

    const subscriptionGroupsList =
      subscriptionGroupsQuery.data.subscriptionGroups || [];
    const subscriptionGroupNames = subscriptionGroupsList.reduce(
      (acc: Map<string, string>, sg) => {
        acc.set(sg.id, sg.name);
        return acc;
      },
      new Map<string, string>(),
    );

    return Array.from(subscriptionGroups).flatMap((id) => {
      const name = subscriptionGroupNames.get(id);
      if (!name) {
        return [];
      }
      return { id, name };
    });
  }, [subscriptionGroups, subscriptionGroupsQuery]);

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
          onDelete={() => onRemoveUserProperty(property.id)}
        />
      ))}
      {joinedFilterSegments.map((segment) => (
        <Chip
          key={segment.id}
          sx={chipSx}
          disabled={staticSegments.has(segment.id)}
          label={`User in ${segment.name}`}
          onDelete={() => onRemoveSegment(segment.id)}
        />
      ))}
      {joinedSubscriptionGroups.map((sg) => (
        <Chip
          key={sg.id}
          sx={chipSx}
          disabled={staticSubscriptionGroups.has(sg.id)}
          label={`User subscribed to ${sg.name}`}
          onDelete={() => onRemoveSubscriptionGroup(sg.id)}
        />
      ))}
      <UsersFilterSelectorV2
        onAddSegment={onAddSegment}
        onAddSubscriptionGroup={onAddSubscriptionGroup}
        onAddUserProperty={onAddUserProperty}
      />
    </Stack>
  );
}
