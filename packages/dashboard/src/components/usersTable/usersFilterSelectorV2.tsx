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
import * as React from "react";

import { useSegmentsQuery } from "../../lib/useSegmentResourcesQuery";
import { useSubscriptionGroupsResourcesQuery } from "../../lib/useSubscriptionGroupsResourcesQuery";
import { useUserPropertyResourcesQuery } from "../../lib/useUserPropertyResourcesQuery";
import { greyTextFieldStyles } from "../greyScaleStyles";
import { SquarePaper } from "../squarePaper";

// ============================================================================
// Filter Stage Types (local UI state)
// ============================================================================

export enum FilterStageType {
  ComputedPropertyType = "ComputedPropertyType",
  UserProperty = "UserProperty",
  UserPropertyValue = "UserPropertyValue",
  Segment = "Segment",
  SubscriptionGroup = "SubscriptionGroup",
}

interface FilterComputedPropertyTypeStage {
  type: FilterStageType.ComputedPropertyType;
}

interface FilterUserPropertyStage {
  type: FilterStageType.UserProperty;
}

interface FilterUserPropertyValueStage {
  type: FilterStageType.UserPropertyValue;
  id: string;
  value: string;
}

interface FilterSegmentStage {
  type: FilterStageType.Segment;
}

interface FilterSubscriptionGroupStage {
  type: FilterStageType.SubscriptionGroup;
}

type FilterStageWithBack =
  | FilterUserPropertyStage
  | FilterSegmentStage
  | FilterUserPropertyValueStage
  | FilterSubscriptionGroupStage;

type FilterStage =
  | FilterUserPropertyStage
  | FilterUserPropertyValueStage
  | FilterSegmentStage
  | FilterSubscriptionGroupStage
  | FilterComputedPropertyTypeStage;

// ============================================================================
// Props
// ============================================================================

export interface UsersFilterSelectorV2Props {
  onAddSegment: (id: string) => void;
  onAddSubscriptionGroup: (id: string) => void;
  onAddUserProperty: (propertyId: string, value: string) => void;
}

// ============================================================================
// Helper Components
// ============================================================================

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
      ListboxProps={{
        sx: {
          padding: 0,
        },
      }}
      PaperComponent={SquarePaper}
      sx={{
        width: theme.spacing(30),
        height: "100%",
      }}
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

function SegmentSelector({
  onAddSegment,
  closeDropdown,
}: {
  onAddSegment: (id: string) => void;
  closeDropdown: () => void;
}) {
  const segmentsQuery = useSegmentsQuery();

  const options: Option[] = React.useMemo(() => {
    if (segmentsQuery.status !== "success") {
      return [];
    }
    const segments = segmentsQuery.data.segments || [];
    return segments.map((segment) => ({
      id: segment.id,
      label: segment.name,
    }));
  }, [segmentsQuery]);

  return (
    <ComputedPropertyAutocomplete
      options={options}
      onChange={(id) => {
        onAddSegment(id);
        closeDropdown();
      }}
      label="Segment"
    />
  );
}

function SubscriptionGroupSelector({
  onAddSubscriptionGroup,
  closeDropdown,
}: {
  onAddSubscriptionGroup: (id: string) => void;
  closeDropdown: () => void;
}) {
  const subscriptionGroupsQuery = useSubscriptionGroupsResourcesQuery();

  const options: Option[] = React.useMemo(() => {
    if (subscriptionGroupsQuery.status !== "success") {
      return [];
    }
    const subscriptionGroups =
      subscriptionGroupsQuery.data.subscriptionGroups || [];
    return subscriptionGroups.map((sg) => ({
      id: sg.id,
      label: sg.name,
    }));
  }, [subscriptionGroupsQuery]);

  return (
    <ComputedPropertyAutocomplete
      options={options}
      onChange={(id) => {
        onAddSubscriptionGroup(id);
        closeDropdown();
      }}
      label="Subscription Group"
    />
  );
}

function UserPropertySelector({
  setStage,
}: {
  setStage: (stage: FilterStage | null) => void;
}) {
  const userPropertiesQuery = useUserPropertyResourcesQuery();

  const options: Option[] = React.useMemo(() => {
    if (userPropertiesQuery.status !== "success") {
      return [];
    }
    const userProperties = userPropertiesQuery.data.userProperties || [];
    return userProperties.map((up) => ({
      id: up.id,
      label: up.name,
    }));
  }, [userPropertiesQuery]);

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
  setStage,
  onAddUserProperty,
  closeDropdown,
}: {
  stage: FilterUserPropertyValueStage;
  setStage: (stage: FilterStage | null) => void;
  onAddUserProperty: (propertyId: string, value: string) => void;
  closeDropdown: () => void;
}) {
  const theme = useTheme();

  const handleSubmit = () => {
    if (stage.value.trim()) {
      onAddUserProperty(stage.id, stage.value);
      closeDropdown();
    }
  };

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
          handleSubmit();
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

function ComputedPropertyTypeSelector({
  setStage,
}: {
  setStage: (stage: FilterStage | null) => void;
}) {
  const theme = useTheme();

  const FilterOptionsArray: {
    title: string;
    type:
      | FilterStageType.Segment
      | FilterStageType.UserProperty
      | FilterStageType.SubscriptionGroup;
  }[] = [
    {
      title: "User Property",
      type: FilterStageType.UserProperty,
    },
    {
      title: "Segment",
      type: FilterStageType.Segment,
    },
    {
      title: "Subscription Group",
      type: FilterStageType.SubscriptionGroup,
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

function SelectorFooter({
  stage,
  setStage,
  onAddUserProperty,
}: {
  stage: FilterStageWithBack;
  setStage: (stage: FilterStage | null) => void;
  onAddUserProperty: (propertyId: string, value: string) => void;
}) {
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
      case FilterStageType.SubscriptionGroup:
        setStage({
          type: FilterStageType.ComputedPropertyType,
        });
        break;
      default:
        assertUnreachable(stage);
    }
  };

  const handleSubmit = () => {
    if (
      stage.type === FilterStageType.UserPropertyValue &&
      stage.value.trim()
    ) {
      onAddUserProperty(stage.id, stage.value);
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
          onClick={handleSubmit}
        >
          Submit
        </Typography>
      ) : null}
    </Box>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function UsersFilterSelectorV2({
  onAddSegment,
  onAddSubscriptionGroup,
  onAddUserProperty,
}: UsersFilterSelectorV2Props) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [stage, setStage] = React.useState<FilterStage | null>(null);
  const open = Boolean(anchorEl);
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
        stageEl = <ComputedPropertyTypeSelector setStage={setStage} />;
        break;
      case FilterStageType.Segment:
        stageEl = (
          <SegmentSelector
            onAddSegment={onAddSegment}
            closeDropdown={handleClose}
          />
        );
        break;
      case FilterStageType.UserProperty:
        stageEl = <UserPropertySelector setStage={setStage} />;
        break;
      case FilterStageType.UserPropertyValue:
        stageEl = (
          <UserPropertyValueSelector
            stage={stage}
            setStage={setStage}
            onAddUserProperty={onAddUserProperty}
            closeDropdown={handleClose}
          />
        );
        break;
      case FilterStageType.SubscriptionGroup:
        stageEl = (
          <SubscriptionGroupSelector
            onAddSubscriptionGroup={onAddSubscriptionGroup}
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
          <SelectorFooter
            stage={stage}
            setStage={setStage}
            onAddUserProperty={onAddUserProperty}
          />
        )}
        {stageEl}
      </Popover>
    </>
  );
}
