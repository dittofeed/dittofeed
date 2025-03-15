import { AddCircleOutline } from "@mui/icons-material";
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
import { greyTextFieldStyles } from "./greyScaleStyles";

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
      sx={{ width: theme.spacing(30), height: "100%" }}
      autoComplete
      disablePortal
      renderInput={(params) => (
        <TextField
          {...params}
          variant="filled"
          label={label}
          autoFocus
          InputProps={{
            ...params.InputProps,
            sx: {
              borderRadius: 0,
            },
          }}
          sx={greyTextFieldStyles}
        />
      )}
      renderOption={(props, option) => {
        return (
          <MenuItem
            {...props}
            sx={{
              borderRadius: 0,
              color: theme.palette.grey[700],
            }}
          >
            <Tooltip title={option.label}>
              <Box
                sx={{
                  width: "100%",
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
  const theme = useTheme();

  return (
    <TextField
      label="Value"
      value={stage.value}
      autoFocus
      variant="filled"
      InputProps={{
        sx: {
          borderRadius: 0,
        },
      }}
      sx={{
        ...greyTextFieldStyles,
        width: theme.spacing(30),
      }}
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
  const theme = useTheme();

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
    <Box sx={{ width: theme.spacing(30) }}>
      {FilterOptionsArray.map((option) => (
        <MenuItem
          key={option.title}
          onClick={() =>
            setStage({
              type: option.type,
            })
          }
          sx={{
            borderRadius: 0,
            py: 1.5,
            color: theme.palette.grey[700],
            "&:hover": {
              backgroundColor: theme.palette.grey[100],
            },
          }}
        >
          <Typography variant="body2">{option.title}</Typography>
        </MenuItem>
      ))}
    </Box>
  );
}

function SelectorFooter({ stage }: { stage: FilterStageWithBack }) {
  const { setStage, addUserProperty } = filterStorePick([
    "setStage",
    "addUserProperty",
  ]);
  const theme = useTheme();

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
      sx={{
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
      alignItems="center"
    >
      <IconButton size="small" onClick={() => handlePrevious()}>
        <KeyboardBackspaceIcon sx={{ color: theme.palette.grey[600] }} />
      </IconButton>

      {stage.type === FilterStageType.UserPropertyValue ? (
        <Typography
          sx={{
            fontSize: "12px",
            cursor: "pointer",
            color: theme.palette.grey[700],
            fontWeight: 500,
            pr: 1,
          }}
          onClick={addUserProperty}
        >
          Submit
        </Typography>
      ) : null}
    </Box>
  );
}

export function UsersFilterSelectorV2() {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const { stage, setStage } = filterStorePick(["setStage", "stage"]);
  const theme = useTheme();

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
        startIcon={<AddCircleOutline />}
        variant="contained"
        color="inherit"
        aria-controls={open ? "basic-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        onClick={handleOpen}
        type="button"
        size="medium"
        sx={{
          height: theme.spacing(4.5),
          bgcolor: theme.palette.grey[300],
          color: theme.palette.grey[700],
          "&:hover": {
            bgcolor: theme.palette.grey[400],
          },
        }}
      >
        Add Filter
      </Button>
      <Popover
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        onClick={(e) => e.stopPropagation()}
        sx={{
          "& .MuiPopover-paper": {
            overflow: "visible",
            borderRadius: 0,
            boxShadow: 4,
          },
          p: 0,
        }}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        onClose={handleClose}
      >
        {stage && stage.type !== FilterStageType.ComputedPropertyType && (
          <SelectorFooter stage={stage} />
        )}
        {stageEl}
      </Popover>
    </>
  );
}
