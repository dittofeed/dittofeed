import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { Box, IconButton } from "@mui/material";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CompletionStatus } from "isomorphic-lib/src/types";
import React from "react";

import { useAppStorePick } from "../lib/appStore";
import { filterStorePick } from "../lib/filterStore";
import UsersFilterSelector from "./usersFilterSelector";

function CloseIconButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton size="small" color="secondary" onClick={onClick}>
      <CloseOutlinedIcon />
    </IconButton>
  );
}
export function UsersFilter({ workspaceId }: { workspaceId: string }) {
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

  // FIXME
  const joinedUserPropertyFilters: {
    id: string;
    name: string;
    values: string[];
  }[] = [];

  return (
    <Stack
      spacing={2}
      direction="row"
      justifyItems="center"
      alignItems="center"
    >
      {joinedUserPropertyFilters.map((property) => (
        <Stack
          bgcolor="grey.300"
          color="text.primary"
          key={property.id}
          direction="row"
        >
          <CloseIconButton
            onClick={() => removeUserPropertyFilter(property.id)}
          />
          <Breadcrumbs aria-label="breadcrumb" separator=">">
            <Typography color="inherit">User Property</Typography>
            <Typography color="inherit">{property.name}</Typography>
            <Breadcrumbs aria-label="breadcrumb" separator="or">
              {property.values.map((value) => (
                <Typography
                  color="inherit"
                  sx={{ cursor: "pointer" }}
                  key={value}
                >
                  {value}
                </Typography>
              ))}
            </Breadcrumbs>
          </Breadcrumbs>
        </Stack>
      ))}
      {joinedFilterSegments.map((segment) => (
        <Stack
          key={segment.id}
          bgcolor="grey.300"
          color="text.primary"
          direction="row"
          alignItems="center"
          pr={1}
        >
          <CloseIconButton onClick={() => removeSegmentFilter(segment.id)} />
          <Breadcrumbs aria-label="breadcrumb" separator=">" id="hello">
            <Typography color="inherit">Segment</Typography>
            <Typography color="inherit">{segment.name}</Typography>
          </Breadcrumbs>
        </Stack>
      ))}
      <UsersFilterSelector />
    </Stack>
  );
}
