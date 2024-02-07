import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { Box } from "@mui/material";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { GetUserPropertiesResponse } from "isomorphic-lib/src/types";
import React, { useMemo } from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { propertiesStore } from "../lib/filterStore";
import FilterSelect from "./usersFilterSelector";

export function UsersFilter({ workspaceId }: { workspaceId: string }) {
  const userPropertyFilterFromStore = propertiesStore(
    (store) => store.userPropertyFilter,
  );
  const removeSegmentFilter = propertiesStore((store) => store.removeSegmentFilter);
  const removePropertyFilter = propertiesStore((store) => store.removePropertyFilter);
  const userPropertyFilter = useMemo(
    () => Object.values(userPropertyFilterFromStore),
    [userPropertyFilterFromStore],
  );
  const segmentFilterFromStore = propertiesStore(
    (store) => store.segmentFilter,
  );
  const segmentFilter = useMemo(
    () => segmentFilterFromStore,
    [segmentFilterFromStore],
  );
  const properties = propertiesStore((store) => store.properties);
  const segments = propertiesStore((store) => store.segments);
  const propertiesValues = propertiesStore((store) => store.propertiesValues);
  const getUserPropertiesRequest = propertiesStore(
    (store) => store.getUserPropertiesRequest,
  );
  const setGetUserPropertiesRequest = propertiesStore(
    (store) => store.setGetUserPropertiesRequest,
  );
  const setSegments = propertiesStore((store) => store.setSegments);
  const setProperties = propertiesStore((store) => store.setProperties);

  const apiBase = useAppStore((store) => store.apiBase);

  React.useEffect(() => {
    const setLoadResponse = (response: GetUserPropertiesResponse) => {
      setProperties(response.properties);
      setSegments(response.segments);
    };

    const handler = apiRequestHandlerFactory({
      request: getUserPropertiesRequest,
      setRequest: setGetUserPropertiesRequest,
      responseSchema: GetUserPropertiesResponse,
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
  }, []);

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
            sx={{ width: 10, mr: 1, cursor: "pointer"}}
            color="secondary"
            onClick={() => removePropertyFilter(property.id)}
          />
          <Breadcrumbs aria-label="breadcrumb" separator=">">
            <Typography color="inherit">User Property</Typography>
            <Typography color="inherit">{properties[property.id]}</Typography>
            {property.userIds &&
              property.userIds.map((userId) => (
                <Typography
                  color="inherit"
                  sx={{cursor: "pointer"}}
                  key={userId}
                  onClick={() => removePropertyFilter(property.id, userId)}
                >
                  {propertiesValues[property.id]![userId]}
                </Typography>
              ))}
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
              sx={{ width: 10, mr: 1, cursor: "pointer"}}
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
      <FilterSelect workspaceId={workspaceId} />
    </Stack>
  );
}
