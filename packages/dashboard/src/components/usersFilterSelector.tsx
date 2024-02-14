import KeyboardBackspaceIcon from "@mui/icons-material/KeyboardBackspace";
import { Box, Stack, TextField, Typography } from "@mui/material";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { GetComputedPropertyAssignmentResourcesResponse } from "isomorphic-lib/src/types";
import * as React from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { filterIds, FilterOptions, filterStore } from "../lib/filterStore";

enum Stage {
  "SELECTING_FILTER",
  "SELECTING_ID",
  "SELECTING_VALUE",
}

function Options({
  handleSelection,
  filteredOptions,
}: {
  handleSelection: (selectedProperty: string | undefined) => void;
  filteredOptions: [string, string][];
}) {
  return (
    <>
      {filteredOptions.map((property) => (
        <MenuItem
          key={property[0]}
          onClick={() => handleSelection(property[0])}
        >
          {property[1]}
        </MenuItem>
      ))}
    </>
  );
}

function IdAndValueSelector({
  stage,
  handleIdSelection,
  handleValueSelection,
  workspaceId,
  filter,
  setFilter,
}: {
  stage: Stage;
  handleIdSelection: (selectedId: string | undefined) => void;
  handleValueSelection: (propertyAssignmentId: string | undefined) => void;
  workspaceId: string;
  filter: string;
  setFilter: (value: string) => void;
}) {
  /// ///////////////////////////////
  // START ID Selector Related
  /// ///////////////////////////////
  // Selected filter can be either Segments or Properties
  const selectedFilter = filterStore((store) => store.selectedFilter);
  // From filterStore, get all segments and properties
  const segments = filterStore((store) => store.segments);
  const properties = filterStore((store) => store.properties);
  /// ///////////////////////////////
  // END ID Selector Related
  /// ///////////////////////////////

  /// ///////////////////////////////
  // START UserPropertyValue Selector Related
  /// ///////////////////////////////
  // Get property value request related
  const apiBase = useAppStore((store) => store.apiBase);
  const getUserPropertiesRequest = filterStore(
    (store) => store.getUserPropertiesRequest,
  );
  const setGetUserPropertiesRequest = filterStore(
    (store) => store.setGetUserPropertiesRequest,
  );
  const setPropertiesValues = filterStore((store) => store.setPropertiesValues);
  // Record<propertyId,value>
  const propertiesValues = filterStore((store) => store.propertiesValues);
  // SelectedPropertyId used to index propertiesValues
  // and GET property values if needed.
  const selectedProperty = filterStore((store) => store.selectedId);

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

    if (selectedProperty !== "" && !propertiesValues[selectedProperty]) {
      handler();
    }
  }, [selectedProperty]);
  /// ///////////////////////////////
  // END UserPropertyValue Selector Related
  /// ///////////////////////////////

  /// ///////////////////////////////
  // START Filter Related
  /// ///////////////////////////////
  // Options to filter are based on the selector's
  // current stage and filter type
  const options = React.useMemo(() => {
    if (stage === Stage.SELECTING_ID) {
      return Object.entries(
        selectedFilter === FilterOptions.SEGMENTS ? segments : properties,
      );
    }
    if (stage === Stage.SELECTING_VALUE) {
      return Object.entries(propertiesValues[selectedProperty] ?? {});
    }
    return [];
  }, [stage, propertiesValues, segments, properties]);

  // Filter runs on filter and options change.
  const filteredOptions = React.useMemo(() => {
    return filterIds(options, filter);
  }, [filter, options]);

  return (
    <>
      <Stack display="flex" alignItems="center" justifyContent="center">
        <TextField
          style={{
            width: "95%",
          }}
          InputProps={{
            style: {
              height: "40px",
            },
          }}
          id="outlined-basic"
          variant="outlined"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </Stack>

      {stage === Stage.SELECTING_ID ? (
        <Options
          handleSelection={handleIdSelection}
          filteredOptions={filteredOptions}
        />
      ) : (
        <Options
          handleSelection={handleValueSelection}
          filteredOptions={filteredOptions}
        />
      )}
    </>
  );
}

function FilterSelectors({
  handleFilterSelection,
}: {
  handleFilterSelection: (selectedFilter: FilterOptions) => void;
}) {
  const FilterOptionsArray = [
    {
      title: "User Property",
      type: FilterOptions.USER_PROPERTY,
    },
    {
      title: "Segment",
      type: FilterOptions.SEGMENTS,
    },
  ];
  return (
    <>
      {FilterOptionsArray.map((option) => (
        <MenuItem
          key={option.title}
          onClick={() => handleFilterSelection(option.type)}
        >
          {option.title}
        </MenuItem>
      ))}
    </>
  );
}

function SelectorFooter({
  stage,
  handlePrevious,
  selectedFilter,
  filter,
  handleValueSelection,
}: {
  stage: Stage;
  filter: string;
  selectedFilter: FilterOptions;
  handlePrevious: () => void;
  handleValueSelection: (value: string, isPartial?: boolean) => void;
}) {
  return (
    <Box
      paddingX="5%"
      textAlign="left"
      height="18px"
      display="flex"
      justifyContent="space-between"
      alignItems="center"
      mt="5px"
    >
      <KeyboardBackspaceIcon
        sx={{ width: "15px", cursor: "pointer" }}
        onClick={() => handlePrevious()}
      />
      {selectedFilter === FilterOptions.USER_PROPERTY &&
      stage === Stage.SELECTING_VALUE &&
      filter !== "" ? (
        <Typography
          sx={{ fontSize: "10px", cursor: "pointer" }}
          onClick={() => handleValueSelection(filter, true)}
        >
          Submit partial match
        </Typography>
      ) : null}
    </Box>
  );
}

export default function FilterSelect({ workspaceId }: { workspaceId: string }) {
  const [filter, setFilter] = React.useState("");
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [stage, setStage] = React.useState<Stage>(Stage.SELECTING_FILTER);
  const setSelectedId = filterStore((store) => store.setSelectedId);
  const setUserPropertyFilter = filterStore(
    (store) => store.setUserPropertyFilter,
  );
  const setSegmentFilter = filterStore((store) => store.setSegmentFilter);
  const setSelectedFilter = filterStore((store) => store.setSelectedFilter);
  const selectedFilter = filterStore((store) => store.selectedFilter);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setTimeout(() => {
      setSelectedId("");
      setSelectedFilter(FilterOptions.NONE);
      setStage(Stage.SELECTING_FILTER);
    }, 300);
  };

  const handleFilterSelection = (filterOption: FilterOptions) => {
    setSelectedFilter(filterOption);
    setStage(Stage.SELECTING_ID);
  };

  const handleIdSelection = (selectedId: string | undefined) => {
    if (!selectedId) return;
    setFilter("");
    if (selectedFilter === FilterOptions.USER_PROPERTY) {
      setSelectedId(selectedId);
      setStage(Stage.SELECTING_VALUE);
    } else {
      setSegmentFilter(selectedId);
      handleClose();
    }
  };

  const handleValueSelection = (
    propertyAssignmentId: string | undefined,
    isPartialMatch?: boolean,
  ) => {
    setFilter("");

    if (propertyAssignmentId) {
      setUserPropertyFilter(propertyAssignmentId, isPartialMatch);
    }

    handleClose();
  };

  const handlePrevious = () => {
    setFilter("");
    if (stage === Stage.SELECTING_ID) {
      setSelectedFilter(FilterOptions.NONE);
      setStage(Stage.SELECTING_FILTER);
    }

    if (stage === Stage.SELECTING_VALUE) {
      setSelectedId("");
      setStage(Stage.SELECTING_ID);
    }
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
      >
        <Box
          maxHeight="200px"
          minWidth="150px"
          maxWidth="150px"
          overflow="scroll"
        >
          {stage === Stage.SELECTING_FILTER ? (
            <FilterSelectors handleFilterSelection={handleFilterSelection} />
          ) : (
            <IdAndValueSelector
              stage={stage}
              handleValueSelection={handleValueSelection}
              handleIdSelection={handleIdSelection}
              workspaceId={workspaceId}
              filter={filter}
              setFilter={setFilter}
            />
          )}
        </Box>
        {stage !== Stage.SELECTING_FILTER && (
          <SelectorFooter
            stage={stage}
            filter={filter}
            selectedFilter={selectedFilter}
            handlePrevious={handlePrevious}
            handleValueSelection={handleValueSelection}
          />
        )}
      </Menu>
    </div>
  );
}
