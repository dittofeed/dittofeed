import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { Box } from "@mui/material";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CompletionStatus } from "isomorphic-lib/src/types";
import React from "react";

import { useAppStorePick } from "../lib/appStore";
import { filterStorePick } from "../lib/filterStore";
import FilterSelect from "./usersFilterSelector";

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
        <Box
          display="flex"
          flexDirection="row"
          bgcolor="grey.300"
          color="text.primary"
          paddingY="5px"
          paddingX="8px"
          key={property.id}
        >
          {/* FIXME icon button */}
          <CloseOutlinedIcon
            sx={{ width: 10, mr: 1, cursor: "pointer" }}
            color="secondary"
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
        </Box>
      ))}
      {joinedFilterSegments.map((segment) => (
        <Stack key={segment.id}>
          <Box
            display="flex"
            flexDirection="row"
            bgcolor="grey.300"
            color="text.primary"
            paddingY="5px"
            paddingX="8px"
          >
            {/* FIXME icon button */}
            <CloseOutlinedIcon
              sx={{ width: 10, mr: 1, cursor: "pointer" }}
              color="secondary"
              onClick={() => removeSegmentFilter(segment.id)}
            />
            <Breadcrumbs aria-label="breadcrumb" separator=">" id="hello">
              <Typography color="inherit">Segment</Typography>
              <Typography color="inherit">{segment.name}</Typography>
            </Breadcrumbs>
          </Box>
        </Stack>
      ))}
      <FilterSelect />
    </Stack>
  );
}
