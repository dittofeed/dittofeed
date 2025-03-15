import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { IconButton, useTheme } from "@mui/material";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CompletionStatus } from "isomorphic-lib/src/types";
import React from "react";

import { useAppStorePick } from "../lib/appStore";
import { filterStorePick } from "../lib/filterStore";
import { UsersFilterSelector } from "./usersFilterSelector";

function CloseIconButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton size="small" color="secondary" onClick={onClick}>
      <CloseOutlinedIcon />
    </IconButton>
  );
}

function AppliedFilter({
  remove,
  name,
  label,
}: {
  name: string;
  label: string;
  remove: () => void;
}) {
  const theme = useTheme();
  return (
    <Stack
      direction="row"
      alignItems="center"
      sx={{
        borderRadius: 1,
        backgroundColor: theme.palette.grey[300],
      }}
      pr={1}
    >
      <CloseIconButton onClick={() => remove()} />
      <Breadcrumbs aria-label="breadcrumb" separator=">" id="hello">
        <Typography color="inherit">{label}</Typography>
        <Typography color="inherit">{name}</Typography>
      </Breadcrumbs>
    </Stack>
  );
}

export function UsersFilter() {
  const { userProperties: userPropertiesResult, segments: segmentResult } =
    useAppStorePick(["userProperties", "segments"]);

  const {
    removeUserProperty: removeUserPropertyFilter,
    removeSegment: removeSegmentFilter,
    userProperties: filterUserProperties,
    segments: filterSegments,
  } = filterStorePick([
    "removeUserProperty",
    "removeSegment",
    "userProperties",
    "segments",
  ]);

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

    return Array.from(filterSegments).flatMap((id) => {
      const name = segmentNames.get(id);
      if (!name) {
        return [];
      }
      return { id, name };
    });
  }, [filterSegments, segmentResult]);

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

    return Array.from(filterUserProperties).flatMap(([id, values]) => {
      const name = userPropertyNames.get(id);
      if (!name) {
        return [];
      }
      return { id, name, values: Array.from(values) };
    });
  }, [filterUserProperties, userPropertiesResult]);

  return (
    <Stack
      spacing={2}
      direction="row"
      justifyItems="center"
      alignItems="center"
    >
      {joinedUserPropertyFilters.flatMap((property) => (
        <AppliedFilter
          key={property.id}
          name={property.values
            .map((value) => `${property.name} = "${value}"`)
            .join(" OR ")}
          label="User Property"
          remove={() => removeUserPropertyFilter(property.id)}
        />
      ))}
      {joinedFilterSegments.map((segment) => (
        <AppliedFilter
          key={segment.id}
          name={segment.name}
          label="Segment"
          remove={() => removeSegmentFilter(segment.id)}
        />
      ))}
      <UsersFilterSelector />
    </Stack>
  );
}
