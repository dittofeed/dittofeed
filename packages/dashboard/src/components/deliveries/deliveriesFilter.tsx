import { AddCircleOutline } from "@mui/icons-material";
import {
  Autocomplete,
  AutocompleteProps,
  Box,
  Button,
  ButtonProps,
  Chip,
  Paper,
  PaperProps,
  SxProps,
  TextField,
  Theme,
  Typography,
} from "@mui/material";
import Popover from "@mui/material/Popover";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  InternalEventType,
  Present,
} from "isomorphic-lib/src/types";
import React, { HTMLAttributes, useCallback, useMemo, useRef } from "react";
import { omit } from "remeda";
import { Updater, useImmer } from "use-immer";

import { useAppStorePick } from "../../lib/appStore";

function SquarePaper(props: PaperProps) {
  return <Paper {...props} square elevation={4} />;
}

const greyTextFieldStyles = {
  "& .MuiFilledInput-root": {
    // Changes the bottom border color in its default state
    backgroundColor: "white",
    "&:before": {
      borderBottomColor: "grey.400",
    },
    // Changes the bottom border color when hovered
    "&:hover:before": {
      borderBottomColor: "grey.400",
    },
    // Changes the bottom border color when focused
    "&:after": {
      borderBottomColor: "grey.400",
    },
  },
  // Changes the label color when focused
  "& .MuiInputLabel-root.Mui-focused": {
    color: "grey.600",
  },
  // Changes the ripple effect color
  "& .MuiTouchRipple-root": {
    color: "grey.600",
  },
} as const;

export interface BaseDeliveriesFilterCommand {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export enum DeliveriesFilterCommandType {
  SelectItem = "SelectItem",
  SelectKey = "SelectKey",
}

export type Key = "template" | "status" | "to" | "from" | "channel";

export type SelectItemCommand = BaseDeliveriesFilterCommand & {
  type: DeliveriesFilterCommandType.SelectItem;
  id: string;
};

export type SelectKeyCommand = BaseDeliveriesFilterCommand & {
  type: DeliveriesFilterCommandType.SelectKey;
  filterKey: Key;
};

export type DeliveriesFilterCommand = SelectItemCommand | SelectKeyCommand;

type CommandHandler = Present<
  AutocompleteProps<DeliveriesFilterCommand, false, false, false>["onChange"]
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

export interface DeliveriesState {
  open: boolean;
  inputValue: string;
  stage: Stage;
  filters: Map<Key, Filter>;
}

export function getFilterValues(
  state: DeliveriesState,
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

type SetDeliveriesState = Updater<DeliveriesState>;

export function useDeliveriesFilterState(): [
  DeliveriesState,
  SetDeliveriesState,
] {
  return useImmer<DeliveriesState>({
    open: false,
    inputValue: "",
    stage: { type: StageType.SelectKey },
    filters: new Map(),
  });
}

export function SelectedDeliveriesFilters({
  state,
  setState,
  sx,
}: {
  sx?: SxProps<Theme>;
  state: DeliveriesState;
  setState: SetDeliveriesState;
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

export function NewDeliveriesFilterButton({
  state,
  setState,
  buttonProps,
  greyScale,
}: {
  buttonProps?: ButtonProps;
  state: DeliveriesState;
  setState: SetDeliveriesState;
  greyScale?: boolean;
}) {
  const { messages } = useAppStorePick(["messages"]);
  const { stage } = state;
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorEl = useRef<HTMLElement | null>(null);

  const commands: DeliveriesFilterCommand[] = useMemo(() => {
    switch (stage.type) {
      case StageType.SelectKey: {
        return [
          {
            label: "Template",
            type: DeliveriesFilterCommandType.SelectKey,
            filterKey: "template",
          },
          {
            label: "To",
            type: DeliveriesFilterCommandType.SelectKey,
            filterKey: "to",
          },
          {
            label: "From",
            type: DeliveriesFilterCommandType.SelectKey,
            filterKey: "from",
          },
          {
            label: "Status",
            type: DeliveriesFilterCommandType.SelectKey,
            filterKey: "status",
          },
          {
            label: "Channel",
            type: DeliveriesFilterCommandType.SelectKey,
            filterKey: "channel",
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
          case DeliveriesFilterCommandType.SelectItem:
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
          case DeliveriesFilterCommandType.SelectKey:
            setState((draft) => {
              draft.inputValue = "";
              switch (value.filterKey) {
                case "template": {
                  const templates =
                    messages.type === CompletionStatus.Successful
                      ? messages.value
                      : [];

                  const children: SelectItemCommand[] = templates.map(
                    (template) => ({
                      label: template.name,
                      type: DeliveriesFilterCommandType.SelectItem,
                      id: template.id,
                    }),
                  );
                  draft.stage = {
                    type: StageType.SelectItem,
                    filterKey: value.filterKey,
                    children,
                  };
                  break;
                }
                case "to":
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
                case "from":
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
                case "status": {
                  const children: SelectItemCommand[] = [
                    {
                      label: "Sent",
                      type: DeliveriesFilterCommandType.SelectItem,
                      id: InternalEventType.MessageSent,
                    },
                    {
                      label: "Email Bounced",
                      type: DeliveriesFilterCommandType.SelectItem,
                      id: InternalEventType.EmailBounced,
                    },
                    {
                      label: "Email Marked as Spam",
                      type: DeliveriesFilterCommandType.SelectItem,
                      id: InternalEventType.EmailMarkedSpam,
                    },
                    {
                      label: "Email Opened",
                      type: DeliveriesFilterCommandType.SelectItem,
                      id: InternalEventType.EmailOpened,
                    },
                    {
                      label: "Email Link Clicked",
                      type: DeliveriesFilterCommandType.SelectItem,
                      id: InternalEventType.EmailClicked,
                    },
                    {
                      label: "Email Delivered",
                      type: DeliveriesFilterCommandType.SelectItem,
                      id: InternalEventType.EmailDelivered,
                    },
                    {
                      label: "Email Bounced",
                      type: DeliveriesFilterCommandType.SelectItem,
                      id: InternalEventType.EmailDelivered,
                    },
                    {
                      label: "Email Dropped",
                      type: DeliveriesFilterCommandType.SelectItem,
                      id: InternalEventType.EmailDropped,
                    },
                    {
                      label: "Sms Delivered",
                      type: DeliveriesFilterCommandType.SelectItem,
                      id: InternalEventType.SmsDelivered,
                    },
                    {
                      label: "Sms Failed",
                      type: DeliveriesFilterCommandType.SelectItem,
                      id: InternalEventType.SmsFailed,
                    },
                  ];
                  draft.stage = {
                    type: StageType.SelectItem,
                    filterKey: value.filterKey,
                    children,
                  };
                  break;
                }
                case "channel": {
                  const children: SelectItemCommand[] = [
                    {
                      label: "Email",
                      id: ChannelType.Email,
                      type: DeliveriesFilterCommandType.SelectItem,
                    },
                    {
                      label: "SMS",
                      id: ChannelType.Sms,
                      type: DeliveriesFilterCommandType.SelectItem,
                    },
                    {
                      label: "Webhook",
                      id: ChannelType.Webhook,
                      type: DeliveriesFilterCommandType.SelectItem,
                    },
                  ];

                  draft.stage = {
                    type: StageType.SelectItem,
                    filterKey: value.filterKey,
                    children,
                  };
                  break;
                }
              }
            });
            break;
          default:
            assertUnreachable(value);
        }
      }
    },
    [setState, messages],
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
      <Autocomplete<DeliveriesFilterCommand>
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
        onInputChange={(event, newInputValue) =>
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
