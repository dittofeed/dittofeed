import KeyboardBackspaceIcon from "@mui/icons-material/KeyboardBackspace";
import { Autocomplete, Box, Stack, TextField, Typography } from "@mui/material";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import * as React from "react";

import {
  FilterStage,
  FilterStageType,
  filterStore,
  filterStorePick,
} from "../lib/filterStore";
import { useAppStorePick } from "../lib/appStore";
import { CompletionStatus } from "isomorphic-lib/src/types";

function Options({
  handleSelection,
  filteredOptions,
  isDisabled,
}: {
  handleSelection: (selectedProperty: string | undefined) => void;
  filteredOptions: [string, string][];
  isDisabled: boolean;
}) {
  return (
    <>
      {isDisabled ? (
        <Stack minWidth="100%" justifyContent="center" alignItems="center">
          <Typography
            sx={{
              opacity: "0.6",
            }}
            variant="caption"
            paddingTop="6px"
            component="div"
          >
            Filtering by {filteredOptions[0] ? filteredOptions[0][1] : null}
          </Typography>
        </Stack>
      ) : (
        <>
          {filteredOptions.map((property) => (
            <MenuItem
              disabled={isDisabled}
              key={property[0]}
              onClick={() => handleSelection(property[0])}
            >
              {property[1]}
            </MenuItem>
          ))}
        </>
      )}
    </>
  );
}

interface Option {
  id: string;
  label: string;
}

function IdAndValueSelector({
  stage,
  handleIdSelection,
  handleValueSelection,
  filter,
  setFilter,
}: {
  stage: Stage;
  handleIdSelection: (selectedId: string | undefined) => void;
  handleValueSelection: (propertyAssignmentId: string | undefined) => void;
  filter: string;
  setFilter: (value: string) => void;
}) {
  /// ///////////////////////////////
  // START ID Selector Related
  /// ///////////////////////////////
  // Selected filter can be either Segments or Properties
  const selectedFilter = filterStore((store) => store.selectedFilter);
  // From filterStore, get all segments and properties
  const selectedId = filterStore((store) => store.selectedId);
  const { segments: segmentsResult, userProperties: userPropertiesResult } =
    useAppStorePick(["segments", "userProperties"]);

  const { segments, userProperties } = React.useMemo(() => {
    return {
      segments:
        segmentsResult.type === CompletionStatus.Successful
          ? segmentsResult.value
          : [],
      userProperties:
        userPropertiesResult.type === CompletionStatus.Successful
          ? userPropertiesResult.value
          : [],
    };
  }, [segmentsResult, userPropertiesResult]);

  /// ///////////////////////////////
  // END ID Selector Related
  /// ///////////////////////////////

  /// ///////////////////////////////
  // START Filter Related
  /// ///////////////////////////////
  // Options to filter are based on the selector's
  // current stage and filter type
  const options: Option[] = React.useMemo(() => {
    if (stage === Stage.SELECTING_ID) {
      if (selectedFilter === FilterStageType.SEGMENTS) {
        return segments.map((segment) => ({
          id: segment.id,
          label: segment.name,
        }));
      }
      if (selectedFilter === FilterStageType.USER_PROPERTY) {
        return userProperties.map((property) => ({
          id: property.id,
          label: property.name,
        }));
      }
    }

    if (stage === Stage.SELECTING_VALUE) {
      const name = userProperties.find(
        (property) => property.id === selectedId,
      )?.name;
      if (!name) return [];
      return [{ id: selectedId, label: name }];
    }

    return [];
  }, [stage, segments, userProperties, selectedFilter, selectedId]);

  const selectedOption =
    options.find((option) => option.id === selectedId) ?? null;

  // Filter runs on filter and options change.
  // const filteredOptions = React.useMemo(() => {
  //   if (stage === Stage.SELECTING_VALUE) return options;
  //   // FIXME
  //   return filterIds(options, filter);
  // }, [filter, options, stage]);

  // FIXM
  if (stage === Stage.SELECTING_VALUE) {
    return (
      <>Foo</>
      // <Autocomplete
      // handleSelection={handleValueSelection}
      // filteredOptions={options}
      // />
    );
  }
  return (
    <Autocomplete
      value={selectedOption}
      options={options}
      onChange={(_, newValue) => {
        if (newValue) {
          handleIdSelection(newValue.id);
        }
      }}
    />
  );
  return (
    <>
      {/* <Stack display="flex" alignItems="center" justifyContent="center">
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
          isDisabled={false}
          handleSelection={handleIdSelection}
          filteredOptions={filteredOptions}
        />
      ) : (
        <Options
          isDisabled
          handleSelection={handleValueSelection}
          filteredOptions={filteredOptions}
        />
      )} */}
    </>
  );
}

function FilterSelectors() {
  const { setStage } = filterStorePick(["setStage"]);
  const FilterOptionsArray: {
    title: string;
    type: FilterStageType.Segment | FilterStageType.UserProperty;
  }[] = [
    {
      title: "User Property",
      type: FilterStageType.UserProperty,
    },
    {
      title: "Segment",
      type: FilterStageType.Segment,
    },
  ];
  return (
    <>
      {FilterOptionsArray.map((option) => (
        <MenuItem
          key={option.title}
          onClick={() =>
            setStage({
              type: option.type,
            })
          }
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
  handleSubmit,
}: {
  stage: FilterStage;
  handlePrevious: () => void;
  handleSubmit: () => void;
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
      {/* // FIXME icon button */}
      <KeyboardBackspaceIcon
        sx={{ width: "15px", cursor: "pointer" }}
        onClick={() => handlePrevious()}
      />
      {stage.type === FilterStageType.UserPropertyValue ? (
        <Typography
          sx={{ fontSize: "10px", cursor: "pointer" }}
          onClick={handleSubmit}
        >
          Submit
        </Typography>
      ) : null}
    </Box>
  );
}

export default function FilterSelect() {
  const [filter, setFilter] = React.useState("");
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  // FIXME use null value of store
  const open = Boolean(anchorEl);
  const { stage, setStage } = filterStorePick(["setStage", "stage"]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setTimeout(() => setStage(null), 300);
  };

  const handleFilterSelection = (filterOption: FilterStageType) => {
    setSelectedFilter(filterOption);
    setStage(Stage.SELECTING_ID);
  };

  const handleIdSelection = (selectedId: string | undefined) => {
    if (!selectedId) return;
    setFilter("");
    if (selectedFilter === FilterStageType.USER_PROPERTY) {
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
      setSelectedFilter(FilterStageType.NONE);
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
          {stage?.type === FilterStageType.ComputedPropertyType ? (
            <FilterSelectors />
          ) : (
            <IdAndValueSelector
              stage={stage}
              handleValueSelection={handleValueSelection}
              handleIdSelection={handleIdSelection}
              filter={filter}
              setFilter={setFilter}
            />
          )}
        </Box>
        {stage && stage.type !== FilterStageType.ComputedPropertyType && (
          <SelectorFooter
            stage={stage}
            handlePrevious={handlePrevious}
            // FIXME
            handleSubmit={() => {}}
          />
        )}
      </Menu>
    </div>
  );
}
