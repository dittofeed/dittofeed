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
  negativeSegments: Set<string>;
  staticNegativeSegments: Set<string>;
  subscriptionGroups: Set<string>;
  staticSubscriptionGroups: Set<string>;
  negativeSubscriptionGroups: Set<string>;
  staticNegativeSubscriptionGroups: Set<string>;

  // Optional name overrides for internal segments (segment ID -> display name)
  segmentNameOverride?: Record<string, string>;

  // Actions
  onRemoveSegment: (id: string) => void;
  onRemoveNegativeSegment: (id: string) => void;
  onRemoveSubscriptionGroup: (id: string) => void;
  onRemoveNegativeSubscriptionGroup: (id: string) => void;
  onRemoveUserProperty: (id: string) => void;
  onAddSegment: (id: string) => void;
  onAddSubscriptionGroup: (id: string) => void;
  onAddUserProperty: (propertyId: string, value: string) => void;
}

export function UsersFilterV2({
  userProperties,
  segments,
  staticSegments,
  negativeSegments,
  staticNegativeSegments,
  subscriptionGroups,
  staticSubscriptionGroups,
  negativeSubscriptionGroups,
  staticNegativeSubscriptionGroups,
  segmentNameOverride,
  onRemoveSegment,
  onRemoveNegativeSegment,
  onRemoveSubscriptionGroup,
  onRemoveNegativeSubscriptionGroup,
  onRemoveUserProperty,
  onAddSegment,
  onAddSubscriptionGroup,
  onAddUserProperty,
}: UsersFilterV2Props) {
  const userPropertiesQuery = useUserPropertyResourcesQuery();
  const segmentsQuery = useSegmentsQuery();
  const subscriptionGroupsQuery = useSubscriptionGroupsResourcesQuery();

  const segmentNames = React.useMemo(() => {
    if (segmentsQuery.status !== "success") {
      return new Map<string, string>();
    }
    const segmentsList = segmentsQuery.data.segments || [];
    return segmentsList.reduce((acc: Map<string, string>, segment) => {
      acc.set(segment.id, segment.name);
      return acc;
    }, new Map<string, string>());
  }, [segmentsQuery]);

  // Helper to get segment name, checking override first
  const getSegmentName = React.useCallback(
    (segmentId: string): string | undefined => {
      return segmentNameOverride?.[segmentId] ?? segmentNames.get(segmentId);
    },
    [segmentNameOverride, segmentNames],
  );

  const joinedFilterSegments: {
    id: string;
    name: string;
  }[] = React.useMemo(() => {
    return Array.from(segments).flatMap((id) => {
      const name = getSegmentName(id);
      if (!name) {
        return [];
      }
      return { id, name };
    });
  }, [segments, getSegmentName]);

  const joinedNegativeFilterSegments: {
    id: string;
    name: string;
  }[] = React.useMemo(() => {
    return Array.from(negativeSegments).flatMap((id) => {
      const name = getSegmentName(id);
      if (!name) {
        return [];
      }
      return { id, name };
    });
  }, [negativeSegments, getSegmentName]);

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

  const subscriptionGroupNames = React.useMemo(() => {
    if (subscriptionGroupsQuery.status !== "success") {
      return new Map<string, string>();
    }
    const subscriptionGroupsList =
      subscriptionGroupsQuery.data.subscriptionGroups || [];
    return subscriptionGroupsList.reduce(
      (acc: Map<string, string>, sg) => {
        acc.set(sg.id, sg.name);
        return acc;
      },
      new Map<string, string>(),
    );
  }, [subscriptionGroupsQuery]);

  const joinedSubscriptionGroups: {
    id: string;
    name: string;
  }[] = React.useMemo(() => {
    return Array.from(subscriptionGroups).flatMap((id) => {
      const name = subscriptionGroupNames.get(id);
      if (!name) {
        return [];
      }
      return { id, name };
    });
  }, [subscriptionGroups, subscriptionGroupNames]);

  const joinedNegativeSubscriptionGroups: {
    id: string;
    name: string;
  }[] = React.useMemo(() => {
    return Array.from(negativeSubscriptionGroups).flatMap((id) => {
      const name = subscriptionGroupNames.get(id);
      if (!name) {
        return [];
      }
      return { id, name };
    });
  }, [negativeSubscriptionGroups, subscriptionGroupNames]);

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
      {joinedNegativeFilterSegments.map((segment) => (
        <Chip
          key={`neg-${segment.id}`}
          sx={chipSx}
          disabled={staticNegativeSegments.has(segment.id)}
          label={`User NOT in ${segment.name}`}
          onDelete={() => onRemoveNegativeSegment(segment.id)}
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
      {joinedNegativeSubscriptionGroups.map((sg) => (
        <Chip
          key={`neg-sg-${sg.id}`}
          sx={chipSx}
          disabled={staticNegativeSubscriptionGroups.has(sg.id)}
          label={`User NOT subscribed to ${sg.name}`}
          onDelete={() => onRemoveNegativeSubscriptionGroup(sg.id)}
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
