import KeyboardBackspaceIcon from "@mui/icons-material/KeyboardBackspace";
import {
  Autocomplete,
  Box,
  IconButton,
  Popover,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { CompletionStatus } from "isomorphic-lib/src/types";
import * as React from "react";

import { useAppStorePick } from "../lib/appStore";
import {
  FilterStageType,
  FilterStageWithBack,
  filterStorePick,
  FilterUserPropertyValueStage,
} from "../lib/filterStore";

interface Option {
  id: string;
  label: string;
}

function ComputedPropertyAutocomplete({
  options,
  onChange,
  label,
}: {
  options: Option[];
  onChange: (id: string) => void;
  label: string;
}) {
  const theme = useTheme();
  return (
    <Autocomplete
      onChange={(_, value) => {
        if (value) {
          onChange(value.id);
        }
      }}
      options={options}
      open
      sx={{ width: theme.spacing(20), height: "100%" }}
      autoComplete
      disablePortal
      renderInput={(params) => (
        <TextField {...params} variant="filled" label={label} autoFocus />
      )}
      renderOption={(props, option) => {
        return (
          <MenuItem {...props}>
            <Tooltip title={option.label}>
              <Box
                sx={{
                  width: theme.spacing(20),
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                {option.label}
              </Box>
            </Tooltip>
          </MenuItem>
        );
      }}
    />
  );
}

function SegmentSelector({ closeDropdown }: { closeDropdown: () => void }) {
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
    <ComputedPropertyAutocomplete
      options={options}
      onChange={(id) => {
        addSegment(id);
        closeDropdown();
      }}
      label="Segment"
    />
  );
}

function UserPropertySelector() {
  const { userProperties: userPropertiesResult } = useAppStorePick([
    "userProperties",
  ]);
  const { setStage } = filterStorePick(["setStage"]);

  const options: Option[] = React.useMemo(() => {
    if (userPropertiesResult.type !== CompletionStatus.Successful) {
      return [];
    }
    return userPropertiesResult.value.map((up) => ({
      id: up.id,
      label: up.name,
    }));
  }, [userPropertiesResult]);

  return (
    <ComputedPropertyAutocomplete
      options={options}
      onChange={(id) => {
        setStage({
          type: FilterStageType.UserPropertyValue,
          id,
          value: "",
        });
      }}
      label="User Property"
    />
  );
}

function UserPropertyValueSelector({
  stage,
  closeDropdown,
}: {
  stage: FilterUserPropertyValueStage;
  closeDropdown: () => void;
}) {
  const { setStage, addUserProperty } = filterStorePick([
    "setStage",
    "addUserProperty",
  ]);
  return (
    <TextField
      label="Value"
      value={stage.value}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          addUserProperty();
          closeDropdown();
        }
      }}
      onChange={(e) => {
        const { value } = e.target;
        setStage({
          type: FilterStageType.UserPropertyValue,
          id: stage.id,
          value,
        });
      }}
    />
  );
}

function ComputedPropertyTypeSelector() {
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
      default:
        assertUnreachable(stage);
    }
  };

  return (
    <Box
      textAlign="left"
      display="flex"
      justifyContent="space-between"
      sx={{ p: 1 }}
      alignItems="center"
    >
      <IconButton size="small" onClick={() => handlePrevious()}>
        <KeyboardBackspaceIcon />
      </IconButton>

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
    if (stage !== null) {
      return;
    }
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
        stageEl = <ComputedPropertyTypeSelector />;
        break;
      case FilterStageType.Segment:
        stageEl = <SegmentSelector closeDropdown={handleClose} />;
        break;
      case FilterStageType.UserProperty:
        stageEl = <UserPropertySelector />;
        break;
      case FilterStageType.UserPropertyValue:
        stageEl = (
          <UserPropertyValueSelector
            stage={stage}
            closeDropdown={handleClose}
          />
        );
        break;
      default:
        assertUnreachable(stage);
    }
  }

  return (
    <>
      <Button
        aria-controls={open ? "basic-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        onClick={handleOpen}
        type="button"
      >
        Add filter
      </Button>
      <Popover
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        onClick={(e) => e.stopPropagation()}
        sx={{
          "& .MuiPopover-paper": {
            overflow: "visible",
          },
        }}
        onClose={handleClose}
      >
        {stage && stage.type !== FilterStageType.ComputedPropertyType && (
          <SelectorFooter stage={stage} />
        )}
        <Box>{stageEl}</Box>
      </Popover>
    </>
  );
}
