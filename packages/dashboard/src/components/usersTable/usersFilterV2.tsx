import { Chip, Stack, SxProps, Theme, useTheme } from "@mui/material";
import { CompletionStatus } from "isomorphic-lib/src/types";
import React from "react";

import { useAppStorePick } from "../../lib/appStore";
import {
  removeSegment,
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
  const { userProperties: userPropertiesResult, segments: segmentResult } =
    useAppStorePick(["userProperties", "segments"]);

  const joinedFilterSegments: {
    id: string;
    name: string;
  }[] = React.useMemo(() => {
    if (segmentResult.type !== CompletionStatus.Successful) {
      return [];
    }
    const segmentNames = segmentResult.value.reduce((acc, segment) => {
      acc.set(segment.id, segment.name);
      return acc;
    }, new Map<string, string>());

    return Array.from(state.segments).flatMap((id) => {
      const name = segmentNames.get(id);
      if (!name) {
        return [];
      }
      return { id, name };
    });
  }, [state.segments, segmentResult]);

  const joinedUserPropertyFilters: {
    id: string;
    name: string;
    values: string[];
  }[] = React.useMemo(() => {
    if (userPropertiesResult.type !== CompletionStatus.Successful) {
      return [];
    }
    const userPropertyNames = userPropertiesResult.value.reduce((acc, up) => {
      acc.set(up.id, up.name);
      return acc;
    }, new Map<string, string>());

    return Array.from(state.userProperties).flatMap(([id, values]) => {
      const name = userPropertyNames.get(id);
      if (!name) {
        return [];
      }
      return { id, name, values: Array.from(values) };
    });
  }, [state.userProperties, userPropertiesResult]);

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
          label={`User in ${
            state.segmentNameOverrides.get(segment.id) ?? segment.name
          }`}
          onDelete={() => removeSegment(updater, segment.id)}
        />
      ))}
      <UsersFilterSelectorV2 state={state} updater={updater} />
    </Stack>
  );
}
