import KeyboardBackspaceIcon from "@mui/icons-material/KeyboardBackspace";
import {
  Autocomplete,
  Box,
  Popover,
  TextField,
  Typography,
  useAutocomplete,
  useTheme,
} from "@mui/material";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { CompletionStatus } from "isomorphic-lib/src/types";
import * as React from "react";

import { useAppStorePick } from "../lib/appStore";
import {
  FilterStageType,
  FilterStageWithBack,
  filterStorePick,
} from "../lib/filterStore";

interface Option {
  id: string;
  label: string;
}

function SegmentSelector({ closeDropdown }: { closeDropdown: () => void }) {
  const theme = useTheme();
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
      open
      sx={{ width: theme.spacing(14), height: "100%" }}
      autoComplete
      disablePortal
      renderInput={(params) => (
        <TextField {...params} variant="filled" label="Segment" />
      )}
      renderOption={(props, option) => {
        return (
          <MenuItem
            {...props}
            onClick={() => {
              addSegment(option.id);
              closeDropdown();
            }}
          >
            {option.label}
          </MenuItem>
        );
      }}
    />
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

export default function UsersFilterSelector() {
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
    setTimeout(() => {
      setStage(null);
    }, 300);
  };

  let stageEl: React.ReactNode = null;
  if (stage) {
    switch (stage.type) {
      case FilterStageType.ComputedPropertyType:
        stageEl = <FilterSelectors />;
        break;
      case FilterStageType.Segment:
        stageEl = <SegmentSelector closeDropdown={handleClose} />;
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
        aria-controls={open ? "basic-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        onClick={handleOpen}
      >
        Add filter
      </Button>
      <Popover
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        sx={{
          "& .MuiPopover-paper": {
            overflow: "visible",
          },
        }}
        onClose={handleClose}
      >
        <Box>{stageEl}</Box>
        {stage && stage.type !== FilterStageType.ComputedPropertyType && (
          <SelectorFooter stage={stage} />
        )}
      </Popover>
    </div>
  );
}
