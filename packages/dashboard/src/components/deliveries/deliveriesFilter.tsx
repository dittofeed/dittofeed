import { AddCircleOutline } from "@mui/icons-material";
import {
  Autocomplete,
  AutocompleteProps,
  Button,
  Chip,
  Paper,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import Popover from "@mui/material/Popover";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import React, { useMemo, useRef } from "react";
import { Updater, useImmer } from "use-immer";

export interface BaseDeliveriesFilterCommand {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export enum DeliveriesFilterCommandType {
  Leaf = "Leaf",
  Parent = "Parent",
}

type Key = "template" | "user" | "status" | "to" | "from";

export type LeafDeliveriesFilterCommand = BaseDeliveriesFilterCommand & {
  type: DeliveriesFilterCommandType.Leaf;
  id: string;
};

export type ParentDeliveriesFilterCommand = BaseDeliveriesFilterCommand & {
  type: DeliveriesFilterCommandType.Parent;
  key: Key;
  children: LeafDeliveriesFilterCommand[];
};

export type DeliveriesFilterCommand =
  | LeafDeliveriesFilterCommand
  | ParentDeliveriesFilterCommand;

interface DeliveriesState {
  open: boolean;
  anchorEl: HTMLElement | null;
  inputValue: string;
  parentKey: Key | null;
  inputRef: React.RefObject<HTMLInputElement>;
  filters: Map<
    // Filter Key e.g. templateId
    Key,
    Map<
      // Filter ID e.g. 16469e6e-5981-4ac7-91f8-6ca34b13a637
      string,
      // Filter Label e.g. My Template Name
      string
    >
  >;
}

type SetDeliveriesState = Updater<DeliveriesState>;

export function useDeliveriesFilterState(): [
  DeliveriesState,
  SetDeliveriesState,
] {
  return useImmer<DeliveriesState>({
    open: false,
    anchorEl: null,
    inputValue: "",
    visibleCommands: null,
    inputRef: useRef<HTMLInputElement>(null),
    filters: new Map(),
  });
}

export function SelectedDeliveriesFilters({
  state,
  setState,
}: {
  state: DeliveriesState;
  setState: SetDeliveriesState;
}) {
  const filterChips = Object.entries(state.filters).map(([key, filters]) => {
    const label = Array.from(filters.values()).join(" OR ");
    return (
      <Chip
        key={key}
        label={`${key} = ${label}`}
        onDelete={() =>
          setState((draft) => {
            draft.filters.delete(key as Key);
          })
        }
      />
    );
  });
  return <>{filterChips}</>;
}

export function NewDeliveriesFilterButton({
  state,
  setState,
}: {
  state: DeliveriesState;
  setState: SetDeliveriesState;
}) {
  const theme = useTheme();
  const commands: DeliveriesFilterCommand[] = useMemo(() => {
    if (!state.parentKey) {
      return [
        {
          label: "Template",
          type: DeliveriesFilterCommandType.Parent,
          key: "template",
          children: [],
        },
        {
          label: "To",
          type: DeliveriesFilterCommandType.Parent,
          key: "to",
          children: [],
        },
        {
          label: "From",
          type: DeliveriesFilterCommandType.Parent,
          key: "from",
          children: [],
        },
        {
          label: "Status",
          type: DeliveriesFilterCommandType.Parent,
          key: "status",
          children: [],
        },
        {
          label: "User",
          type: DeliveriesFilterCommandType.Parent,
          key: "user",
          children: [],
        },
      ];
    }
    switch (state.parentKey) {
      case "template":
        return [];
      case "user":
        return [];
      case "status":
        return [];
      case "to":
        return [];
      case "from":
        return [];
      default:
        assertUnreachable(state.parentKey);
    }
  }, [state.parentKey]);

  const handleCommandSelect: AutocompleteProps<
    DeliveriesFilterCommand,
    false,
    false,
    false
  >["onChange"] = (_event, value) => {
    if (value) {
      switch (value.type) {
        case DeliveriesFilterCommandType.Leaf:
          setState((draft) => {
            if (!draft.parentKey) {
              return draft;
            }
            draft.inputValue = "";
            draft.open = false;
            const existing = draft.filters.get(draft.parentKey) ?? new Map();
            existing.set(value.id, value.label);
            draft.filters.set(draft.parentKey, existing);
            return draft;
          });
          break;
        case DeliveriesFilterCommandType.Parent:
          setState((draft) => {
            draft.parentKey = value.key;
          });
          break;
        default:
          assertUnreachable(value);
      }
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setState((draft) => {
      draft.anchorEl = event.currentTarget;
      draft.open = true;
    });
  };

  const handleClose = () => {
    setState((draft) => {
      draft.anchorEl = null;
      draft.open = false;
      draft.parentKey = null;
    });
  };

  return (
    <>
      <Button
        onClick={handleClick}
        startIcon={<AddCircleOutline />}
        size="small"
        sx={{
          color: theme.palette.grey[800],
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        Add Filter
      </Button>
      <Popover
        open={state.open}
        anchorEl={state.anchorEl}
        onClose={handleClose}
        TransitionProps={{
          onEntered: () => {
            state.inputRef.current?.focus();
          },
        }}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        sx={{
          "& .MuiPopover-paper": {
            overflow: "visible",
          },
        }}
      >
        <Autocomplete
          disablePortal
          open
          ListboxProps={{
            sx: {
              padding: 0,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
            },
          }}
          inputValue={state.inputValue}
          disableClearable
          onInputChange={(event, newInputValue) =>
            setState((draft) => {
              draft.inputValue = newInputValue;
            })
          }
          options={commands}
          getOptionLabel={(option) => option.label}
          onChange={handleCommandSelect}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Settings"
              variant="filled"
              inputRef={state.inputRef}
            />
          )}
          renderOption={(props, option) => (
            <Paper
              component="li"
              {...props}
              sx={{
                opacity: option.disabled ? 0.5 : 1,
                pointerEvents: option.disabled ? "none" : "auto",
                borderRadius: 0,
                width: 300,
              }}
            >
              <Typography
                variant="body2"
                style={{ display: "flex", alignItems: "center" }}
              >
                {option.icon}
                <span style={{ marginLeft: "8px" }}>{option.label}</span>
              </Typography>
            </Paper>
          )}
          getOptionDisabled={(option) => option.disabled ?? false}
          sx={{ width: 300, padding: 0, height: "100%" }}
        />
      </Popover>
    </>
  );
}
