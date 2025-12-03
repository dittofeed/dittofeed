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
  Tooltip,
  Typography,
} from "@mui/material";
import Popover from "@mui/material/Popover";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  AnalysisChartFilters,
  InternalEventType,
  Present,
} from "isomorphic-lib/src/types";
import React, { HTMLAttributes, useCallback, useMemo, useRef } from "react";
import { omit } from "remeda";
import { Updater, useImmer } from "use-immer";

import { useResourcesQuery } from "../../lib/useResourcesQuery";
import { greyTextFieldStyles } from "../greyScaleStyles";
import {
  sharedFilterButtonProps,
  sharedFilterChipSx,
} from "../shared/filterStyles";
import { SquarePaper } from "../squarePaper";

export interface BaseAnalysisFilterCommand {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export enum AnalysisFilterCommandType {
  SelectItem = "SelectItem",
  SelectKey = "SelectKey",
}

export type AnalysisFilterKey =
  | "journeyIds"
  | "broadcastIds"
  | "channels"
  | "providers"
  | "messageStates"
  | "templateIds";

export type SelectItemCommand = BaseAnalysisFilterCommand & {
  type: AnalysisFilterCommandType.SelectItem;
  id: string;
};

export type SelectKeyCommand = BaseAnalysisFilterCommand & {
  type: AnalysisFilterCommandType.SelectKey;
  filterKey: AnalysisFilterKey;
};

export type AnalysisFilterCommand = SelectItemCommand | SelectKeyCommand;

type CommandHandler = Present<
  AutocompleteProps<AnalysisFilterCommand, false, false, false>["onChange"]
>;

export enum FilterType {
  MultiSelect = "MultiSelect",
}

export interface MultiSelectFilter {
  type: FilterType.MultiSelect;
  value: Map<string, string>;
}

export type Filter = MultiSelectFilter;

export enum StageType {
  SelectKey = "SelectKey",
  SelectItem = "SelectItem",
}

export interface SelectKeyStage {
  type: StageType.SelectKey;
}

export interface SelectItemStage {
  type: StageType.SelectItem;
  filterKey: AnalysisFilterKey;
  children: SelectItemCommand[];
}

export type Stage = SelectKeyStage | SelectItemStage;

export interface AnalysisFiltersState {
  open: boolean;
  inputValue: string;
  stage: Stage;
  filters: Map<AnalysisFilterKey, Filter>;
}

const keyCommandLabels: Record<AnalysisFilterKey, string> = {
  journeyIds: "Journey",
  broadcastIds: "Broadcast",
  channels: "Channel",
  providers: "Provider",
  messageStates: "Message Status",
  templateIds: "Template",
};

const keyCommands: readonly AnalysisFilterCommand[] = [
  {
    label: keyCommandLabels.journeyIds,
    type: AnalysisFilterCommandType.SelectKey,
    filterKey: "journeyIds",
  },
  {
    label: keyCommandLabels.broadcastIds,
    type: AnalysisFilterCommandType.SelectKey,
    filterKey: "broadcastIds",
  },
  {
    label: keyCommandLabels.channels,
    type: AnalysisFilterCommandType.SelectKey,
    filterKey: "channels",
  },
  {
    label: keyCommandLabels.providers,
    type: AnalysisFilterCommandType.SelectKey,
    filterKey: "providers",
  },
  {
    label: keyCommandLabels.messageStates,
    type: AnalysisFilterCommandType.SelectKey,
    filterKey: "messageStates",
  },
  {
    label: keyCommandLabels.templateIds,
    type: AnalysisFilterCommandType.SelectKey,
    filterKey: "templateIds",
  },
] as const;

export function getFilterValues(
  state: AnalysisFiltersState,
  filterKey: AnalysisFilterKey,
): string[] | undefined {
  const filter = state.filters.get(filterKey);
  if (!filter) {
    return;
  }
  return Array.from(filter.value.keys());
}

type SetAnalysisFiltersState = Updater<AnalysisFiltersState>;

export function useAnalysisFiltersState(): [
  AnalysisFiltersState,
  SetAnalysisFiltersState,
] {
  return useImmer<AnalysisFiltersState>({
    open: false,
    inputValue: "",
    stage: { type: StageType.SelectKey },
    filters: new Map(),
  });
}

export function SelectedAnalysisFilters({
  state,
  setState,
  sx,
  hardcodedFilters,
}: {
  sx?: SxProps<Theme>;
  state: AnalysisFiltersState;
  setState: SetAnalysisFiltersState;
  hardcodedFilters?: AnalysisChartFilters | null;
}) {
  const { data: resources } = useResourcesQuery({
    broadcasts: true,
    journeys: true,
    messageTemplates: true,
  });

  const resolveIdToName = useCallback(
    (filterKey: AnalysisFilterKey, id: string): string => {
      switch (filterKey) {
        case "journeyIds": {
          const journey = resources?.journeys?.find((j) => j.id === id);
          return journey ? journey.name : id;
        }
        case "broadcastIds": {
          const broadcast = resources?.broadcasts?.find((b) => b.id === id);
          return broadcast ? broadcast.name : id;
        }
        case "templateIds": {
          const template = resources?.messageTemplates?.find(
            (t) => t.id === id,
          );
          return template ? template.name : id;
        }
        default:
          return id;
      }
    },
    [resources],
  );

  const filterChips = Array.from(state.filters.entries()).map(
    ([key, filter]) => {
      const label = Array.from(filter.value.values()).join(" OR ");
      const keyLabel = keyCommandLabels[key];
      const fullLabel = `${keyLabel} = ${label}`;
      return (
        <Tooltip key={key} title={fullLabel} placement="bottom-start">
          <Chip
            sx={{
              ...sharedFilterChipSx,
              ...sx,
            }}
            label={fullLabel}
            onDelete={() =>
              setState((draft) => {
                draft.filters.delete(key);
              })
            }
          />
        </Tooltip>
      );
    },
  );

  // Add hardcoded filters as disabled chips
  const hardcodedChips = hardcodedFilters
    ? Object.entries(hardcodedFilters)
        .filter(([, value]) => value !== undefined && value.length > 0)
        .map(([key, value]) => {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          const filterKey = key as AnalysisFilterKey;
          const keyLabel = keyCommandLabels[filterKey];

          // Resolve IDs to names
          const resolvedValues = value.map((id: string) =>
            resolveIdToName(filterKey, id),
          );
          const label = resolvedValues.join(" OR ");
          const fullLabel = `${keyLabel} = ${label}`;

          return (
            <Tooltip
              key={`hardcoded-${key}`}
              title={fullLabel}
              placement="bottom-start"
            >
              <Chip
                sx={{
                  ...sharedFilterChipSx,
                  ...sx,
                  opacity: 0.7,
                  "& .MuiChip-deleteIcon": {
                    display: "none",
                  },
                }}
                label={fullLabel}
                disabled
              />
            </Tooltip>
          );
        })
    : [];

  return <>{[...hardcodedChips, ...filterChips]}</>;
}

export function NewAnalysisFilterButton({
  state,
  setState,
  buttonProps,
  greyScale,
}: {
  buttonProps?: ButtonProps;
  state: AnalysisFiltersState;
  setState: SetAnalysisFiltersState;
  greyScale?: boolean;
}) {
  const { data: resources } = useResourcesQuery({
    broadcasts: true,
    journeys: true,
    messageTemplates: true,
  });
  const { stage } = state;

  const inputRef = useRef<HTMLInputElement>(null);
  const anchorEl = useRef<HTMLElement | null>(null);

  const commands: readonly AnalysisFilterCommand[] = useMemo(() => {
    switch (stage.type) {
      case StageType.SelectKey: {
        return keyCommands;
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
          case AnalysisFilterCommandType.SelectItem:
            setState((draft) => {
              const { stage: currentStage } = draft;
              if (currentStage.type !== StageType.SelectItem) {
                return draft;
              }
              draft.inputValue = "";
              draft.open = false;
              const maybeExisting = draft.filters.get(currentStage.filterKey);
              const existing = maybeExisting ?? {
                type: FilterType.MultiSelect,
                value: new Map(),
              };

              existing.value.set(value.id, value.label);
              draft.filters.set(currentStage.filterKey, existing);
              draft.stage = { type: StageType.SelectKey };
              return draft;
            });
            break;
          case AnalysisFilterCommandType.SelectKey:
            setState((draft) => {
              draft.inputValue = "";
              switch (value.filterKey) {
                case "journeyIds": {
                  const journeyOptions = resources?.journeys ?? [];
                  const children: SelectItemCommand[] = journeyOptions.map(
                    (journey) => ({
                      label: journey.name,
                      type: AnalysisFilterCommandType.SelectItem,
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
                case "broadcastIds": {
                  const broadcastOptions = resources?.broadcasts ?? [];
                  const children: SelectItemCommand[] = broadcastOptions.map(
                    (broadcast) => ({
                      label: broadcast.name,
                      type: AnalysisFilterCommandType.SelectItem,
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
                case "channels": {
                  const children: SelectItemCommand[] = [
                    {
                      label: "Email",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: "Email",
                    },
                    {
                      label: "SMS",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: "Sms",
                    },
                    {
                      label: "Mobile Push",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: "MobilePush",
                    },
                    {
                      label: "Webhook",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: "Webhook",
                    },
                  ];
                  draft.stage = {
                    type: StageType.SelectItem,
                    filterKey: value.filterKey,
                    children,
                  };
                  break;
                }
                case "providers": {
                  // Provider types matching EmailProviderType enum values
                  const children: SelectItemCommand[] = [
                    {
                      label: "SendGrid",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: "SendGrid",
                    },
                    {
                      label: "Amazon SES",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: "AmazonSes",
                    },
                    {
                      label: "Postmark",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: "Postmark",
                    },
                    {
                      label: "Resend",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: "Resend",
                    },
                    {
                      label: "SMTP",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: "Smtp",
                    },
                    {
                      label: "Gmail",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: "Gmail",
                    },
                  ];
                  draft.stage = {
                    type: StageType.SelectItem,
                    filterKey: value.filterKey,
                    children,
                  };
                  break;
                }
                case "messageStates": {
                  const children: SelectItemCommand[] = [
                    {
                      label: "Sent",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: InternalEventType.MessageSent,
                    },
                    {
                      label: "Email Bounced",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: InternalEventType.EmailBounced,
                    },
                    {
                      label: "Email Marked as Spam",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: InternalEventType.EmailMarkedSpam,
                    },
                    {
                      label: "Email Opened",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: InternalEventType.EmailOpened,
                    },
                    {
                      label: "Email Link Clicked",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: InternalEventType.EmailClicked,
                    },
                    {
                      label: "Email Delivered",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: InternalEventType.EmailDelivered,
                    },
                    {
                      label: "Email Dropped",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: InternalEventType.EmailDropped,
                    },
                    {
                      label: "Sms Delivered",
                      type: AnalysisFilterCommandType.SelectItem,
                      id: InternalEventType.SmsDelivered,
                    },
                    {
                      label: "Sms Failed",
                      type: AnalysisFilterCommandType.SelectItem,
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
                case "templateIds": {
                  const templateOptions = resources?.messageTemplates ?? [];
                  const children: SelectItemCommand[] = templateOptions.map(
                    (template) => ({
                      label: template.name,
                      type: AnalysisFilterCommandType.SelectItem,
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
              }
            });
            break;
          default:
            assertUnreachable(value);
        }
      }
    },
    [setState, resources],
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

  const popoverBody =
    commands.length > 0 ? (
      <Autocomplete<AnalysisFilterCommand>
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
            label="Add Filter"
            variant="filled"
            sx={greyScale ? greyTextFieldStyles : undefined}
            inputRef={inputRef}
          />
        )}
        renderOption={(props, option) => {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
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
    ) : null;

  return (
    <>
      <Button
        startIcon={<AddCircleOutline />}
        variant="contained"
        color="info"
        {...buttonProps}
        {...sharedFilterButtonProps}
        sx={{
          ...sharedFilterButtonProps.sx,
          ...buttonProps?.sx,
        }}
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
