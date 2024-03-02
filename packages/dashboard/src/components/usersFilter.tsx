import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { Box } from "@mui/material";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ReadAllUserPropertiesResponse } from "isomorphic-lib/src/types";
import React, { useMemo } from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { filterStore } from "../lib/filterStore";
import FilterSelect from "./usersFilterSelector";

export function UsersFilter({ workspaceId }: { workspaceId: string }) {
  const userPropertyFilterFromStore = filterStore(
    (store) => store.userPropertyFilter,
  );
  const removeSegmentFilter = filterStore((store) => store.removeSegmentFilter);
  const removePropertyFilter = filterStore(
    (store) => store.removePropertyFilter,
  );
  const userPropertyFilter = useMemo(
    () => Object.values(userPropertyFilterFromStore),
    [userPropertyFilterFromStore],
  );
  const segmentFilterFromStore = filterStore((store) => store.segmentFilter);
  const segmentFilter = useMemo(
    () => segmentFilterFromStore,
    [segmentFilterFromStore],
  );
  const properties = filterStore((store) => store.properties);
  const segments = filterStore((store) => store.segments);
  const getUserPropertiesRequest = filterStore(
    (store) => store.getUserPropertiesRequest,
  );
  const setGetUserPropertiesRequest = filterStore(
    (store) => store.setGetUserPropertiesRequest,
  );
  const setSegments = filterStore((store) => store.setSegments);
  const setProperties = filterStore((store) => store.setProperties);

  const apiBase = useAppStore((store) => store.apiBase);

  React.useEffect(() => {
    const setLoadResponse = (response: ReadAllUserPropertiesResponse) => {
      setProperties(response.userProperties);
      setSegments(response.segments);
    };

    const handler = apiRequestHandlerFactory({
      request: getUserPropertiesRequest,
      setRequest: setGetUserPropertiesRequest,
      responseSchema: ReadAllUserPropertiesResponse,
      setResponse: setLoadResponse,
      requestConfig: {
        method: "GET",
        url: `${apiBase}/api/user-properties`,
        params: {
          workspaceId,
        },
        headers: {
          "Content-Type": "application/json",
        },
      },
    });
    handler();
  }, [apiBase, workspaceId]);

  return (
    <Stack
      spacing={2}
      direction="row"
      justifyItems="center"
      alignItems="center"
    >
      {userPropertyFilter.map((property) => (
        <Box
          display="flex"
          flexDirection="row"
          bgcolor="grey.300"
          color="text.primary"
          paddingY="5px"
          paddingX="8px"
          key={property.id}
        >
          <CloseOutlinedIcon
            sx={{ width: 10, mr: 1, cursor: "pointer" }}
            color="secondary"
            onClick={() => removePropertyFilter(property.id)}
          />
          <Breadcrumbs aria-label="breadcrumb" separator=">">
            <Typography color="inherit">User Property</Typography>
            <Typography color="inherit">{properties[property.id]}</Typography>
            <Breadcrumbs aria-label="breadcrumb" separator="or">
              {property.partial?.map((partial) => (
                <Typography
                  color="inherit"
                  sx={{ cursor: "pointer" }}
                  key={partial}
                  onClick={() =>
                    removePropertyFilter(property.id, partial, true)
                  }
                >
                  {partial.slice(0, -1)}
                </Typography>
              ))}
            </Breadcrumbs>
          </Breadcrumbs>
        </Box>
      ))}
      {segmentFilter.map((property) => (
        <Stack key={segments[property]}>
          <Box
            display="flex"
            flexDirection="row"
            bgcolor="grey.300"
            color="text.primary"
            paddingY="5px"
            paddingX="8px"
          >
            <CloseOutlinedIcon
              sx={{ width: 10, mr: 1, cursor: "pointer" }}
              color="secondary"
              onClick={() => removeSegmentFilter(property)}
            />
            <Breadcrumbs aria-label="breadcrumb" separator=">" id="hello">
              <Typography color="inherit">Segment</Typography>
              <Typography color="inherit">{segments[property]}</Typography>
            </Breadcrumbs>
          </Box>
        </Stack>
      ))}
      <FilterSelect />
    </Stack>
  );
}
