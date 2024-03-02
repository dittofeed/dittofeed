import KeyboardBackspaceIcon from "@mui/icons-material/KeyboardBackspace";
import { Autocomplete, Box, Stack, TextField, Typography } from "@mui/material";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import * as React from "react";

import {
  FilterSegmentStage,
  FilterStage,
  FilterStageType,
  FilterStageWithBack,
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

function SegmentSelector({ stage }: { stage: FilterSegmentStage }) {
  const { segments: segmentsResult } = useAppStorePick(["segments"]);
  const { addSegment } = filterStorePick(["addSegment"]);

  const options: Option[] = React.useMemo(() => {
    if (segmentsResult.type !== CompletionStatus.Successful) {
      return [];
    }
    return segmentsResult.value.map((segment) => ({
      id: segment.id,
      label: segment.name,
    }));
  }, [segmentsResult]);

  return (
    <Autocomplete
      options={options}
      onChange={(_, value) => {
        if (value) {
          addSegment(value.id);
        }
      }}
      renderInput={(params) => <TextField {...params} label="Segment" />}
    />
  );
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
              filter: "",
            })
          }
        >
          {option.title}
        </MenuItem>
      ))}
    </>
  );
}

function SelectorFooter({ stage }: { stage: FilterStageWithBack }) {
  const { setStage, addUserProperty } = filterStorePick([
    "setStage",
    "addUserProperty",
  ]);

  const handlePrevious = () => {
    switch (stage.type) {
      case FilterStageType.UserPropertyValue:
        setStage({
          type: FilterStageType.UserProperty,
          filter: "",
        });
        break;
      case FilterStageType.UserProperty:
        setStage({
          type: FilterStageType.ComputedPropertyType,
        });
        break;
      case FilterStageType.Segment:
        setStage({
          type: FilterStageType.ComputedPropertyType,
        });
        break;
    }
  };

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
          onClick={addUserProperty}
        >
          Submit
        </Typography>
      ) : null}
    </Box>
  );
}

export default function FilterSelect() {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const { stage, setStage } = filterStorePick(["setStage", "stage"]);

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    setStage({
      type: FilterStageType.ComputedPropertyType,
    });
  };

  const handleClose = () => {
    setAnchorEl(null);
    setStage(null);
  };

  let stageEl: React.ReactNode = null;
  if (stage) {
    switch (stage.type) {
      case FilterStageType.ComputedPropertyType:
        stageEl = <FilterSelectors />;
        break;
      case FilterStageType.Segment:
        stageEl = <SegmentSelector stage={stage} />;
        break;
      default:
        throw new Error("unimplemented");
        // FIXME
        break;
    }
  }

  return (
    <div>
      <Button
        id="basic-button"
        aria-controls={open ? "basic-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        onClick={handleOpen}
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
          {stageEl}
        </Box>
        {stage && stage.type !== FilterStageType.ComputedPropertyType && (
          <SelectorFooter stage={stage} />
        )}
      </Menu>
    </div>
  );
}
