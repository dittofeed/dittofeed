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
  handleStageChange: (selectedProperty: string | undefined) => void;
}) {
  const selectedFilter = propertiesStore((store) => store.selectedFilter);
  const segments = propertiesStore((store) => store.segments);
  const properties = propertiesStore((store) => store.properties);
  const options = React.useMemo(
    () =>
      selectedFilter === FilterOptions.SEGMENTS
        ? Object.entries(segments)
        : Object.entries(properties),
    [],
  );

  return (
    <>
      {options.map((property) => (
        <MenuItem
          key={property[0]}
          onClick={() => handleStageChange(property[0])}
        >
          {property[1]}
        </MenuItem>
      ))}
    </>
  );
}

function PropertyValueSelector({
  handleValueSelection,
  workspaceId,
}: {
  handleValueSelection: (propertyAssignmentId: string | undefined) => void;
  workspaceId: string;
}) {
  const propertiesValues = propertiesStore((store) => store.propertiesValues);
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
    () => Object.entries(selectedPropertyValues ?? {}),
    [selectedPropertyValues],
  );

  function filterProperties(inputArray: [string,string][], filterString: string): [string,string][]{
    return inputArray.filter(([firstValue]) => firstValue.includes(filterString));
  }

  const filteredProperties = React.useMemo(
    () => filterProperties(propertyNames, filter),
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
        filteredProperties.map((property) => (
          <MenuItem
            key={property[0]}
            onClick={() => handleValueSelection(property[0])}
          >
            {property[1]}
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

const IdAndValueSelector = ({
    stage,
    handleIdSelection,
    handleValueSelection,
    workspaceId
} : {
    stage: Stage,
    handleIdSelection: (selectedId: string | undefined) => void,
    handleValueSelection: (propertyAssignmentId: string | undefined) => void,
    workspaceId: string
}) => {
    if (stage === Stage.SELECTING_ID)   {
        return <IdSelector handleStageChange={handleIdSelection} />
    }

    return (
          <PropertyValueSelector
            handleValueSelection={handleValueSelection}
            workspaceId={workspaceId}
          />
    )
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

  const handleIdSelection = (selectedId: string | undefined) => {
    if (!selectedId) return
    if (selectedFilter === FilterOptions.USER_PROPERTY) {
      setSelectedProperty(selectedId);
      setStage(Stage.SELECTING_VALUE);
    } else {
      setSegmentFilter(selectedId);
      handleClose();
    }
  };

  const handleValueSelection = (propertyAssignmentId: string | undefined) => {
      if (propertyAssignmentId) {
        setUserPropertyFilter(propertyAssignmentId);
      }
    
    handleClose();
  };

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
      > {stage === Stage.SELECTING_FILTER 
          ? <FilterSelectors handleFilterSelection={handleFilterSelection} /> 
          : <IdAndValueSelector 
                stage={stage} 
                handleValueSelection={handleValueSelection} 
                handleIdSelection={handleIdSelection}
                workspaceId={workspaceId}
            />
        }
      </Menu>
    </div>
  );
}
