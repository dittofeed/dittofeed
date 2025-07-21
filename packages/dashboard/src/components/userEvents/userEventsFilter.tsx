import { AddCircleOutline } from "@mui/icons-material";
import {
  Autocomplete,
  AutocompleteProps,
  Box,
  Button,
  ButtonProps,
  Chip,
  Paper,
  SxProps,
  TextField,
  Theme,
  Typography,
} from "@mui/material";
import Popover from "@mui/material/Popover";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  CompletionStatus,
  InternalEventType,
  Present,
} from "isomorphic-lib/src/types";
import React, { HTMLAttributes, useCallback, useMemo, useRef } from "react";
import { omit } from "remeda";
import { Updater, useImmer } from "use-immer";

import { useAppStorePick } from "../../lib/appStore";
import { greyTextFieldStyles } from "../greyScaleStyles";
import { SquarePaper } from "../squarePaper";

export interface BaseUserEventsFilterCommand {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export enum UserEventsFilterCommandType {
  SelectItem = "SelectItem",
  SelectKey = "SelectKey",
}

export type Key = "event" | "broadcastId" | "journeyId" | "eventType" | "messageId" | "userId";

export type SelectItemCommand = BaseUserEventsFilterCommand & {
  type: UserEventsFilterCommandType.SelectItem;
  id: string;
};

export type SelectKeyCommand = BaseUserEventsFilterCommand & {
  type: UserEventsFilterCommandType.SelectKey;
  filterKey: Key;
};

export type UserEventsFilterCommand = SelectItemCommand | SelectKeyCommand;

type CommandHandler = Present<
  AutocompleteProps<UserEventsFilterCommand, false, false, false>["onChange"]
>;

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

export interface SelectItemStage {
  type: StageType.SelectItem;
  filterKey: Key;
  children: SelectItemCommand[];
}
export interface SelectValueStage {
  type: StageType.SelectValue;
  label: string;
  filterKey: Key;
  value: Filter;
}

export type Stage = SelectKeyStage | SelectItemStage | SelectValueStage;

export interface UserEventsState {
  open: boolean;
  inputValue: string;
  stage: Stage;
  filters: Map<Key, Filter>;
}

export function getFilterValues(
  state: UserEventsState,
  filterKey: Key,
): string[] | undefined {
  const filter = state.filters.get(filterKey);
  if (!filter) {
    return;
  }
  return filter.type === FilterType.Value
    ? [filter.value]
    : Array.from(filter.value.keys());
}

type SetUserEventsState = Updater<UserEventsState>;

export function useUserEventsFilterState(): [
  UserEventsState,
  SetUserEventsState,
] {
  return useImmer<UserEventsState>({
    open: false,
    inputValue: "",
    stage: { type: StageType.SelectKey },
    filters: new Map(),
  });
}

export function SelectedUserEventsFilters({
  state,
  setState,
  sx,
}: {
  sx?: SxProps<Theme>;
  state: UserEventsState;
  setState: SetUserEventsState;
}) {
  const filterChips = Array.from(state.filters.entries()).map(
    ([key, filters]) => {
      let label: string;
      switch (filters.type) {
        case FilterType.Key: {
          label = Array.from(filters.value.values()).join(" OR ");
          break;
        }
        case FilterType.Value: {
          label = filters.value;
          break;
        }
      }
      return (
        <Chip
          key={key}
          sx={sx}
          label={`${key} = ${label}`}
          onDelete={() =>
            setState((draft) => {
              draft.filters.delete(key as Key);
            })
          }
        />
      );
    },
  );
  return <>{filterChips}</>;
}

export function NewUserEventsFilterButton({
  state,
  setState,
  buttonProps,
  greyScale,
}: {
  buttonProps?: ButtonProps;
  state: UserEventsState;
  setState: SetUserEventsState;
  greyScale?: boolean;
}) {
  const { broadcasts, journeys, messages } = useAppStorePick(["broadcasts", "journeys", "messages"]);
  const { stage } = state;
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorEl = useRef<HTMLElement | null>(null);

  const commands: UserEventsFilterCommand[] = useMemo(() => {
    switch (stage.type) {
      case StageType.SelectKey: {
        return [
          {
            label: "Event Name",
            type: UserEventsFilterCommandType.SelectKey,
            filterKey: "event",
          },
          {
            label: "Broadcast",
            type: UserEventsFilterCommandType.SelectKey,
            filterKey: "broadcastId",
          },
          {
            label: "Journey",
            type: UserEventsFilterCommandType.SelectKey,
            filterKey: "journeyId",
          },
          {
            label: "Event Type",
            type: UserEventsFilterCommandType.SelectKey,
            filterKey: "eventType",
          },
          {
            label: "Message ID",
            type: UserEventsFilterCommandType.SelectKey,
            filterKey: "messageId",
          },
          {
            label: "User ID",
            type: UserEventsFilterCommandType.SelectKey,
            filterKey: "userId",
          },
        ];
      }
      case StageType.SelectValue: {
        return [];
      }
      case StageType.SelectItem: {
        return stage.children;
      }
      default:
        assertUnreachable(stage);
    }
  }, [stage]);

  const handleCommandSelect = useCallback<CommandHandler>(
    (_event, value) => {
      if (value) {
        switch (value.type) {
          case UserEventsFilterCommandType.SelectItem:
            setState((draft) => {
              const { stage: currentStage } = draft;
              if (currentStage.type !== StageType.SelectItem) {
                return draft;
              }
              draft.inputValue = "";
              draft.open = false;
              const maybeExisting = draft.filters.get(currentStage.filterKey);
              if (maybeExisting?.type === FilterType.Value) {
                console.error("Expected key filter value");
                return draft;
              }
              const existing = maybeExisting ?? {
                type: FilterType.Key,
                value: new Map(),
              };

              existing.value.set(value.id, value.label);
              draft.filters.set(currentStage.filterKey, existing);
              draft.stage = { type: StageType.SelectKey };
              return draft;
            });
            break;
          case UserEventsFilterCommandType.SelectKey:
            setState((draft) => {
              draft.inputValue = "";
              switch (value.filterKey) {
                case "event": {
                  // For event names, we would need to fetch available events from the API
                  // For now, allow free text input
                  draft.stage = {
                    type: StageType.SelectValue,
                    filterKey: value.filterKey,
                    label: value.label,
                    value: {
                      type: FilterType.Value,
                      value: "",
                    },
                  };
                  break;
                }
                case "broadcastId": {
                  const children: SelectItemCommand[] = broadcasts.map(
                    (broadcast) => ({
                      label: broadcast.name,
                      type: UserEventsFilterCommandType.SelectItem,
                      id: broadcast.id,
                    }),
                  );
                  draft.stage = {
                    type: StageType.SelectItem,
                    filterKey: value.filterKey,
                    children,
                  };
                  break;
                }
                case "journeyId": {
                  const journeyOptions = journeys.type === CompletionStatus.Successful 
                    ? journeys.value 
                    : [];
                  const children: SelectItemCommand[] = journeyOptions.map(
                    (journey) => ({
                      label: journey.name,
                      type: UserEventsFilterCommandType.SelectItem,
                      id: journey.id,
                    }),
                  );
                  draft.stage = {
                    type: StageType.SelectItem,
                    filterKey: value.filterKey,
                    children,
                  };
                  break;
                }
                case "eventType": {
                  const children: SelectItemCommand[] = [
                    {
                      label: "Track",
                      type: UserEventsFilterCommandType.SelectItem,
                      id: "track",
                    },
                    {
                      label: "Identify",
                      type: UserEventsFilterCommandType.SelectItem,
                      id: "identify",
                    },
                    {
                      label: "Page",
                      type: UserEventsFilterCommandType.SelectItem,
                      id: "page",
                    },
                    {
                      label: "Screen",
                      type: UserEventsFilterCommandType.SelectItem,
                      id: "screen",
                    },
                    {
                      label: "Group",
                      type: UserEventsFilterCommandType.SelectItem,
                      id: "group",
                    },
                    {
                      label: "Alias",
                      type: UserEventsFilterCommandType.SelectItem,
                      id: "alias",
                    },
                  ];
                  draft.stage = {
                    type: StageType.SelectItem,
                    filterKey: value.filterKey,
                    children,
                  };
                  break;
                }
                case "messageId":
                case "userId":
                  draft.stage = {
                    type: StageType.SelectValue,
                    filterKey: value.filterKey,
                    label: value.label,
                    value: {
                      type: FilterType.Value,
                      value: "",
                    },
                  };
                  break;
              }
            });
            break;
          default:
            assertUnreachable(value);
        }
      }
    },
    [setState, broadcasts, journeys, messages],
  );

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    anchorEl.current = event.currentTarget;
    setState((draft) => {
      draft.open = true;
    });
  };

  const handleClose = () => {
    anchorEl.current = null;
    setState((draft) => {
      draft.open = false;
      draft.stage = { type: StageType.SelectKey };
    });
  };

  let popoverBody: React.ReactNode;
  if (state.stage.type === StageType.SelectValue) {
    popoverBody = (
      <TextField
        autoFocus
        variant="filled"
        InputProps={{
          sx: {
            borderRadius: 0,
          },
        }}
        sx={{
          ...(greyScale ? greyTextFieldStyles : {}),
          width: 300,
        }}
        label={state.stage.label}
        value={state.stage.value.value}
        onChange={(event) =>
          setState((draft) => {
            if (draft.stage.type !== StageType.SelectValue) {
              return draft;
            }
            draft.stage.value.value = event.target.value;
            return draft;
          })
        }
        onKeyDown={(event) => {
          if (event.key !== "Enter") {
            return;
          }
          event.preventDefault();

          setState((draft) => {
            if (draft.stage.type !== StageType.SelectValue) {
              return draft;
            }
            if (draft.stage.value.type !== FilterType.Value) {
              return draft;
            }
            // Set the filter
            draft.filters.set(draft.stage.filterKey, {
              type: FilterType.Value,
              value: draft.stage.value.value,
            });
            // Reset and close
            draft.open = false;
            draft.stage = { type: StageType.SelectKey };
            return draft;
          });
        }}
      />
    );
  } else if (commands.length > 0) {
    popoverBody = (
      <Autocomplete<UserEventsFilterCommand>
        disablePortal
        open
        ListboxProps={{
          sx: {
            padding: 0,
          },
        }}
        PaperComponent={SquarePaper}
        value={null}
        inputValue={state.inputValue}
        onInputChange={(_event, newInputValue) =>
          setState((draft) => {
            draft.inputValue = newInputValue;
          })
        }
        options={commands}
        getOptionLabel={(option) => option.label}
        onChange={(event, value, reason, details) => {
          handleCommandSelect(event, value, reason, details);
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            autoFocus
            label="Settings"
            variant="filled"
            sx={greyScale ? greyTextFieldStyles : undefined}
            inputRef={inputRef}
          />
        )}
        renderOption={(props, option) => {
          const propsWithKey = props as HTMLAttributes<HTMLLIElement> & {
            key: string;
          };
          return (
            <Paper
              component="li"
              square
              key={option.label}
              {...omit(propsWithKey, ["key"])}
              sx={{
                opacity: option.disabled ? 0.5 : 1,
                pointerEvents: option.disabled ? "none" : "auto",
                borderRadius: 0,
                width: 300,
              }}
            >
              <Typography
                variant="body2"
                style={{
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {option.icon}
                <span style={{ marginLeft: "8px" }}>{option.label}</span>
              </Typography>
            </Paper>
          );
        }}
        getOptionDisabled={(option) => option.disabled ?? false}
        sx={{
          width: 300,
          padding: 0,
          height: "100%",
        }}
      />
    );
  } else {
    popoverBody = null;
  }

  return (
    <>
      <Button
        startIcon={<AddCircleOutline />}
        variant="contained"
        color="info"
        {...buttonProps}
        onClick={handleClick}
      >
        Add Filter
      </Button>
      <Popover
        open={state.open}
        anchorEl={anchorEl.current}
        onClose={handleClose}
        TransitionProps={{
          onEntered: () => {
            inputRef.current?.focus();
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
        <Box sx={{ opacity: state.open ? 1 : 0 }}>{popoverBody}</Box>
      </Popover>
    </>
  );
}