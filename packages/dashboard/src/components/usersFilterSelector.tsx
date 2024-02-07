import { Box, TextField } from "@mui/material";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { GetComputedPropertyAssignmentResourcesResponse } from "isomorphic-lib/src/types";
import * as React from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { FilterOptions, propertiesStore } from "../lib/filterStore";

enum Stage {
  "SELECTING_FILTER",
  "SELECTING_ID",
  "SELECTING_VALUE",
}

function IdSelector({
  handleStageChange,
}: {
  handleStageChange: (selectedProperty: string) => void;
}) {
  const selectedFilter = propertiesStore((store) => store.selectedFilter);
  const segments = propertiesStore((store) => store.segments);
  const properties = propertiesStore((store) => store.properties);
  const options = React.useMemo(
    () =>
      selectedFilter === FilterOptions.SEGMENTS
        ? Object.keys(segments)
        : Object.keys(properties),
    [],
  );

  return (
    <>
      {Object.values(options).map((property, key) => (
        <MenuItem
          key={options[key]}
          onClick={() => handleStageChange(options[key]!)}
        >
          {property}
        </MenuItem>
      ))}
    </>
  );
}

function PropertyValueSelector({
  handleValueSelection,
  workspaceId,
}: {
  handleValueSelection: (propertyAssignmentId: string) => void;
  workspaceId: string;
}) {
  const propertiesValues = propertiesStore((store) => store.propertiesValues);
  const values = React.useMemo(
    () => Object.keys(propertiesValues),
    [propertiesValues],
  );
  const selectedProperty = propertiesStore((store) => store.selectedProperty);
  const getUserPropertiesRequest = propertiesStore(
    (store) => store.getUserPropertiesRequest,
  );
  const setGetUserPropertiesRequest = propertiesStore(
    (store) => store.setGetUserPropertiesRequest,
  );
  const setPropertiesValues = propertiesStore(
    (store) => store.setPropertiesValues,
  );
  const apiBase = useAppStore((store) => store.apiBase);

  const [filter, setFilter] = React.useState("");
  const selectedPropertyValues = React.useMemo(
    () => propertiesValues[selectedProperty],
    [selectedProperty, propertiesValues],
  );
  const propertyNames = React.useMemo(
    () => Object.values(selectedPropertyValues ?? {}),
    [selectedPropertyValues],
  );

  function filterStrings(inputStr: string, stringArray: string[]) {
    if (inputStr === "") return stringArray;
    return stringArray.filter((str) =>
      str.toLowerCase().includes(inputStr.toLowerCase()),
    );
  }
  const filteredProperties = React.useMemo(
    () => filterStrings(filter, propertyNames),
    [filter, propertyNames],
  );

  React.useEffect(() => {
    const setLoadResponse = (
      response: GetComputedPropertyAssignmentResourcesResponse,
    ) => {
      setPropertiesValues(response.values);
    };

    const handler = apiRequestHandlerFactory({
      request: getUserPropertiesRequest,
      setRequest: setGetUserPropertiesRequest,
      responseSchema: GetComputedPropertyAssignmentResourcesResponse,
      setResponse: setLoadResponse,
      requestConfig: {
        method: "GET",
        url: `${apiBase}/api/user-properties/values`,
        params: {
          propertyId: selectedProperty,
          workspaceId,
        },
        headers: {
          "Content-Type": "application/json",
        },
      },
    });

    if (!propertiesValues[selectedProperty]) {
      handler();
    }
  }, [selectedProperty]);

  return (
    <Box component="section">
      <TextField
        id="outlined-basic"
        variant="outlined"
        onChange={(e) => setFilter(e.target.value)}
      />

      {selectedPropertyValues &&
        filteredProperties.map((property, key) => (
          <MenuItem
            key={values[key]}
            onClick={() => handleValueSelection(values[key]!)}
          >
            {property}
          </MenuItem>
        ))}
    </Box>
  );
}

function FilterSelectors({
  handleFilterSelection,
}: {
  handleFilterSelection: (selectedFilter: FilterOptions) => void;
}) {
  return (
    <>
      <MenuItem
        onClick={() => handleFilterSelection(FilterOptions.USER_PROPERTY)}
      >
        User Property
      </MenuItem>
      <MenuItem onClick={() => handleFilterSelection(FilterOptions.SEGMENTS)}>
        Segment
      </MenuItem>
    </>
  );
}

export default function FilterSelect({ workspaceId }: { workspaceId: string }) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [stage, setStage] = React.useState<Stage>(Stage.SELECTING_FILTER);
  const setSelectedProperty = propertiesStore(
    (store) => store.setSelectedProperty,
  );
  const setUserPropertyFilter = propertiesStore(
    (store) => store.setUserPropertyFilter,
  );
  const setSegmentFilter = propertiesStore((store) => store.setSegmentFilter);
  const setSelectedFilter = propertiesStore((store) => store.setSelectedFilter);
  const selectedFilter = propertiesStore((store) => store.selectedFilter);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setTimeout(() => {
      setSelectedProperty("");
      setSelectedFilter(FilterOptions.NONE);
      setStage(Stage.SELECTING_FILTER);
    }, 300);
  };

  const handleFilterSelection = (filterOption: FilterOptions) => {
    setSelectedFilter(filterOption);
    setStage(Stage.SELECTING_ID);
  };

  const handleIdSelection = (selectedId: string) => {
    if (selectedFilter === FilterOptions.USER_PROPERTY) {
      setSelectedProperty(selectedId);
      setStage(Stage.SELECTING_VALUE);
    } else {
      setSegmentFilter(selectedId);
      handleClose();
    }
  };

  const handleValueSelection = (propertyAssignmentId: string) => {
    setUserPropertyFilter(propertyAssignmentId);
    handleClose();
  };
  if (stage === Stage.SELECTING_FILTER)
    return <FilterSelectors handleFilterSelection={handleFilterSelection} />;

  return (
    <div>
      <Button
        id="basic-button"
        aria-controls={open ? "basic-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        onClick={handleClick}
      >
        Add filter
      </Button>
      <Menu
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "basic-button",
        }}
      >
        {stage === Stage.SELECTING_ID ? (
          <IdSelector handleStageChange={handleIdSelection} />
        ) : (
          <PropertyValueSelector
            handleValueSelection={handleValueSelection}
            workspaceId={workspaceId}
          />
        )}
      </Menu>
    </div>
  );
}
