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
  KeyLeaf = "KeyLeaf",
  KeyParent = "KeyParent",
  ValueParent = "ValueParent",
}

export type Key = "template" | "status" | "to" | "from";

export type KeyLeafDeliveriesFilterCommand = BaseDeliveriesFilterCommand & {
  type: DeliveriesFilterCommandType.KeyLeaf;
  id: string;
};

export type KeyParentDeliveriesFilterCommand = BaseDeliveriesFilterCommand & {
  type: DeliveriesFilterCommandType.KeyParent;
  key: Key;
  children: KeyLeafDeliveriesFilterCommand[];
};

export type ValueParentDeliveriesFilterCommand = BaseDeliveriesFilterCommand & {
  type: DeliveriesFilterCommandType.ValueParent;
  key: Key;
};

export type DeliveriesFilterCommand =
  | ValueParentDeliveriesFilterCommand
  | KeyLeafDeliveriesFilterCommand
  | KeyParentDeliveriesFilterCommand;

export enum FilterType {
  Key = "Key",
  Value = "Value",
}

export interface NameIdFilter {
  type: FilterType.Key;
  // Map of filter ID to filter label
  value: Map<string, string>;
}

export interface ValueFilter {
  type: FilterType.Value;
  value: string;
}

export type Filter = NameIdFilter | ValueFilter;

export enum StageType {
  SelectKey = "SelectKey",
  SelectItem = "SelectItem",
  SelectValue = "SelectValue",
}

export interface SelectKeyStage {
  type: StageType.SelectKey;
}

export interface SelectItem extends BaseDeliveriesFilterCommand {
  id: string;
}

export interface SelectItemStage {
  type: StageType.SelectItem;
  key: Key;
  children: SelectItem[];
}
export interface SelectValueStage {
  type: StageType.SelectValue;
  key: Key;
  value: Filter;
}

export type Stage = SelectKeyStage | SelectItemStage | SelectValueStage;

export interface DeliveriesState {
  open: boolean;
  anchorEl: HTMLElement | null;
  inputValue: string;
  stage: Stage;
  inputRef: React.RefObject<HTMLInputElement>;
  filters: Map<
    // Filter Key e.g. templateId
    Key,
    Filter
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
    stage: { type: StageType.SelectKey },
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
    if (state.stage.type === StageType.SelectKey) {
      return [
        {
          label: "Template",
          type: DeliveriesFilterCommandType.KeyParent,
          key: "template",
          children: [],
        },
        {
          label: "To",
          type: DeliveriesFilterCommandType.KeyParent,
          key: "to",
          children: [],
        },
        {
          label: "From",
          type: DeliveriesFilterCommandType.KeyParent,
          key: "from",
          children: [],
        },
        {
          label: "Status",
          type: DeliveriesFilterCommandType.KeyParent,
          key: "status",
          children: [],
        },
      ];
    }
    switch (state.stage.key) {
      case "template":
        return [];
      case "status":
        return [];
      default:
        return [];
    }
  }, [state.stage]);

  const handleCommandSelect: AutocompleteProps<
    DeliveriesFilterCommand,
    false,
    false,
    false
  >["onChange"] = (_event, value) => {
    if (value) {
      switch (value.type) {
        case DeliveriesFilterCommandType.KeyLeaf:
          setState((draft) => {
            const { stage } = draft;
            if (stage.type !== StageType.SelectItem) {
              return draft;
            }
            draft.inputValue = "";
            draft.open = false;
            const maybeExisting = draft.filters.get(stage.key);
            if (maybeExisting?.type === FilterType.Value) {
              console.error("Expected key filter value");
              return draft;
            }
            const existing = maybeExisting ?? {
              type: FilterType.Key,
              value: new Map(),
            };

            existing.value.set(value.id, value.label);
            draft.filters.set(stage.key, existing);
            return draft;
          });
          break;
        case DeliveriesFilterCommandType.KeyParent:
          setState((draft) => {
            draft.stage = {
              type: StageType.SelectItem,
              key: value.key,
              children: [],
            };
          });
          break;
        case DeliveriesFilterCommandType.ValueParent:
          setState((draft) => {
            if (draft.stage.type !== StageType.SelectItem) {
              return draft;
            }
            draft.stage = {
              type: StageType.SelectValue,
              key: value.key,
              value: {
                type: FilterType.Value,
                value: "",
              },
            };
            return draft;
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
      draft.stage = { type: StageType.SelectKey };
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
