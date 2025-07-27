import { CalendarDate } from "@internationalized/date";
import {
  Bolt as BoltIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import {
  Box,
  Divider,
  FormControl,
  IconButton,
  MenuItem,
  Popover,
  Select,
  Stack,
  Tooltip,
} from "@mui/material";
import { subDays, subMinutes } from "date-fns";
import {
  ChannelType,
  DeliveriesAllowedColumn,
  SearchDeliveriesRequest,
} from "isomorphic-lib/src/types";
import { useCallback, useMemo, useRef } from "react";
import { Updater, useImmer } from "use-immer";
import { useInterval } from "usehooks-ts";

import { toCalendarDate } from "../lib/dates";
import {
  getFilterValues,
  NewDeliveriesFilterButton,
  SelectedDeliveriesFilters,
  useDeliveriesFilterState,
} from "./deliveries/deliveriesFilter";
import { DeliveriesBody } from "./deliveriesTableV2/deliveriesBody";
import { GreyButton, greyButtonStyle } from "./greyButtonStyle";
import { greyMenuItemStyles, greySelectStyles } from "./greyScaleStyles";
import { RangeCalendar } from "./rangeCalendar";

export const DEFAULT_ALLOWED_COLUMNS: DeliveriesAllowedColumn[] = [
  "preview",
  "from",
  "to",
  "userId",
  "channel",
  "status",
  "origin",
  "template",
  "sentAt",
];

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatCalendarDate(date: CalendarDate) {
  return formatDate(
    date.toDate(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
}

interface State {
  selectedTimeOption: string;
  referenceDate: Date;
  customDateRange: {
    start: CalendarDate;
    end: CalendarDate;
  } | null;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  autoReload: boolean;
}

type SetState = Updater<State>;

export const TimeOptionId = {
  LastSevenDays: "last-7-days",
  LastThirtyDays: "last-30-days",
  LastNinetyDays: "last-90-days",
  LastHour: "last-hour",
  Last24Hours: "last-24-hours",
  Custom: "custom",
} as const;

export type TimeOptionId = (typeof TimeOptionId)[keyof typeof TimeOptionId];

interface MinuteTimeOption {
  type: "minutes";
  id: TimeOptionId;
  minutes: number;
  label: string;
}

interface CustomTimeOption {
  type: "custom";
  id: typeof TimeOptionId.Custom;
  label: string;
}

type TimeOption = MinuteTimeOption | CustomTimeOption;

const defaultTimeOptionValue = {
  type: "minutes",
  id: TimeOptionId.LastSevenDays,
  minutes: 7 * 24 * 60,
  label: "Last 7 days",
} as const;

const defaultTimeOptionId = defaultTimeOptionValue.id;

const timeOptions: TimeOption[] = [
  {
    type: "minutes",
    id: TimeOptionId.LastHour,
    minutes: 60,
    label: "Last hour",
  },
  {
    type: "minutes",
    id: TimeOptionId.Last24Hours,
    minutes: 24 * 60,
    label: "Last 24 hours",
  },
  defaultTimeOptionValue,
  {
    type: "minutes",
    id: TimeOptionId.LastThirtyDays,
    minutes: 30 * 24 * 60,
    label: "Last 30 days",
  },
  {
    type: "minutes",
    id: TimeOptionId.LastNinetyDays,
    minutes: 90 * 24 * 60,
    label: "Last 90 days",
  },
  { type: "custom", id: TimeOptionId.Custom, label: "Custom Date Range" },
];

export const DEFAULT_DELIVERIES_TABLE_V2_PROPS: DeliveriesTableV2Props = {
  templateUriTemplate: "/templates/{channel}/{templateId}",
  broadcastUriTemplate: "/broadcasts/v2",
  originUriTemplate: "/{originType}s/{originId}",
  columnAllowList: DEFAULT_ALLOWED_COLUMNS,
  autoReloadByDefault: false,
  reloadPeriodMs: 10000,
};

interface DeliveriesTableV2Props {
  templateUriTemplate?: string;
  broadcastUriTemplate?: string;
  originUriTemplate?: string;
  columnAllowList?: DeliveriesAllowedColumn[];
  userId?: string[] | string;
  groupId?: string[] | string;
  broadcastId?: string;
  journeyId?: string;
  triggeringProperties?: SearchDeliveriesRequest["triggeringProperties"];
  autoReloadByDefault?: boolean;
  reloadPeriodMs?: number;
  defaultTimeOption?: TimeOptionId;
}

export function DeliveriesTableV2({
  templateUriTemplate,
  originUriTemplate,
  userId,
  groupId,
  columnAllowList,
  journeyId,
  triggeringProperties,
  broadcastId,
  autoReloadByDefault = false,
  reloadPeriodMs = 30000,
  broadcastUriTemplate,
  defaultTimeOption: defaultTimeOptionOverride = defaultTimeOptionId,
}: DeliveriesTableV2Props) {
  const [deliveriesFilterState, setDeliveriesFilterState] =
    useDeliveriesFilterState();
  const initialEndDate = useMemo(() => new Date(), []);
  const initialStartDate = useMemo(
    () => subMinutes(initialEndDate, defaultTimeOptionValue.minutes),
    [initialEndDate],
  );

  const [state, setState] = useImmer<State>({
    selectedTimeOption: defaultTimeOptionOverride,
    referenceDate: new Date(),
    customDateRange: null,
    dateRange: {
      startDate: initialStartDate,
      endDate: initialEndDate,
    },
    autoReload: autoReloadByDefault,
  });

  useInterval(
    () => {
      setState((draft) => {
        const selectedOption = timeOptions.find(
          (o) => o.id === draft.selectedTimeOption,
        );
        if (selectedOption && selectedOption.type === "minutes") {
          const now = new Date();
          draft.dateRange.endDate = now;
          draft.dateRange.startDate = subMinutes(now, selectedOption.minutes);
        }
      });
    },
    state.autoReload && state.selectedTimeOption !== "custom"
      ? reloadPeriodMs
      : null,
  );

  const customDateRef = useRef<HTMLInputElement | null>(null);

  const customOnClickHandler = useCallback(() => {
    setState((draft) => {
      if (draft.selectedTimeOption === "custom") {
        draft.customDateRange = {
          start: toCalendarDate(draft.referenceDate),
          end: toCalendarDate(draft.referenceDate),
        };
      }
    });
  }, [setState]);

  // Convert deliveries filter state to individual filter props
  const deliveriesFilters = useMemo(() => {
    return {
      templateIds: getFilterValues(deliveriesFilterState, "template"),
      channels: getFilterValues(deliveriesFilterState, "channel") as ChannelType[] | undefined,
      to: getFilterValues(deliveriesFilterState, "to"),
      statuses: getFilterValues(deliveriesFilterState, "status"),
      from: getFilterValues(deliveriesFilterState, "from"),
    };
  }, [deliveriesFilterState]);

  return (
    <>
      <Stack
        spacing={1}
        sx={{
          width: "100%",
          height: "100%",
          minWidth: 0,
          alignItems: "stretch",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ width: "100%", height: "48px" }}
        >
          <FormControl>
            <Select
              value={state.selectedTimeOption}
              renderValue={(value) => {
                const option = timeOptions.find((o) => o.id === value);
                if (option?.type === "custom") {
                  return `${formatDate(state.dateRange.startDate)} - ${formatDate(state.dateRange.endDate)}`;
                }
                return option?.label;
              }}
              ref={customDateRef}
              MenuProps={{
                anchorOrigin: {
                  vertical: "bottom",
                  horizontal: "left",
                },
                transformOrigin: {
                  vertical: "top",
                  horizontal: "left",
                },
                sx: greyMenuItemStyles,
              }}
              sx={greySelectStyles}
              onChange={(e) =>
                setState((draft) => {
                  if (e.target.value === "custom") {
                    const dayBefore = subDays(draft.referenceDate, 1);
                    draft.customDateRange = {
                      start: toCalendarDate(dayBefore),
                      end: toCalendarDate(draft.referenceDate),
                    };
                    return;
                  }
                  const option = timeOptions.find(
                    (o) => o.id === e.target.value,
                  );
                  if (option === undefined || option.type !== "minutes") {
                    return;
                  }
                  draft.selectedTimeOption = option.id;
                  draft.dateRange.startDate = subMinutes(
                    draft.referenceDate,
                    option.minutes,
                  );
                  draft.dateRange.endDate = draft.referenceDate;
                })
              }
              size="small"
            >
              {timeOptions.map((option) => (
                <MenuItem
                  key={option.id}
                  value={option.id}
                  onClick={
                    option.id === "custom" ? customOnClickHandler : undefined
                  }
                >
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Popover
            open={Boolean(state.customDateRange)}
            anchorEl={customDateRef.current}
            onClose={() => {
              setState((draft) => {
                draft.customDateRange = null;
              });
            }}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "left",
            }}
            transformOrigin={{
              vertical: "top",
              horizontal: "left",
            }}
          >
            <RangeCalendar
              value={state.customDateRange}
              visibleDuration={{ months: 2 }}
              onChange={(newValue) => {
                setState((draft) => {
                  draft.customDateRange = newValue;
                });
              }}
              footer={
                <Stack direction="row" justifyContent="space-between">
                  <Stack justifyContent="center" alignItems="center" flex={1}>
                    {state.customDateRange?.start &&
                      formatCalendarDate(state.customDateRange.start)}
                    {" - "}
                    {state.customDateRange?.end &&
                      formatCalendarDate(state.customDateRange.end)}
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <GreyButton
                      onClick={() => {
                        setState((draft) => {
                          draft.customDateRange = null;
                        });
                      }}
                    >
                      Cancel
                    </GreyButton>
                    <GreyButton
                      onClick={() => {
                        setState((draft) => {
                          if (draft.customDateRange) {
                            draft.dateRange.startDate =
                              draft.customDateRange.start.toDate(
                                Intl.DateTimeFormat().resolvedOptions()
                                  .timeZone,
                              );
                            draft.dateRange.endDate =
                              draft.customDateRange.end.toDate(
                                Intl.DateTimeFormat().resolvedOptions()
                                  .timeZone,
                              );

                            draft.customDateRange = null;
                            draft.selectedTimeOption = "custom";
                          }
                        });
                      }}
                      sx={{
                        borderColor: "grey.400",
                        borderWidth: "1px",
                        borderStyle: "solid",
                        fontWeight: "bold",
                      }}
                    >
                      Apply
                    </GreyButton>
                  </Stack>
                </Stack>
              }
            />
          </Popover>
          <Divider
            orientation="vertical"
            flexItem
            sx={{ borderColor: "grey.300" }}
          />
          <Stack direction="row" spacing={1} flex={1} sx={{ height: "100%" }}>
            <NewDeliveriesFilterButton
              state={deliveriesFilterState}
              setState={setDeliveriesFilterState}
              greyScale
              buttonProps={{
                disableRipple: true,
                sx: {
                  ...greyButtonStyle,
                  fontWeight: "bold",
                },
              }}
            />
            <SelectedDeliveriesFilters
              state={deliveriesFilterState}
              setState={setDeliveriesFilterState}
              sx={{
                height: "100%",
              }}
            />
          </Stack>
          <Tooltip title="Refresh Results" placement="bottom-start">
            <IconButton
              disabled={state.selectedTimeOption === "custom"}
              onClick={() => {
                setState((draft) => {
                  const option = timeOptions.find(
                    (o) => o.id === draft.selectedTimeOption,
                  );
                  if (option === undefined || option.type !== "minutes") {
                    return;
                  }
                  const endDate = new Date();
                  draft.dateRange.endDate = endDate;
                  draft.dateRange.startDate = subMinutes(endDate, option.minutes);
                });
              }}
              sx={{
                border: "1px solid",
                borderColor: "grey.400",
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip
            title={`Auto refresh every ${Math.floor(reloadPeriodMs / 1000)} seconds`}
            placement="bottom-start"
          >
            <IconButton
              disabled={state.selectedTimeOption === "custom"}
              onClick={() => {
                setState((draft) => {
                  draft.autoReload = !draft.autoReload;
                });
              }}
              sx={{
                border: "1px solid",
                borderColor: "grey.400",
                bgcolor: state.autoReload ? "grey.600" : "inherit",
                color: state.autoReload ? "white" : "inherit",
                "&:hover": {
                  bgcolor: state.autoReload ? "grey.700" : undefined,
                },
              }}
            >
              <BoltIcon />
            </IconButton>
          </Tooltip>
        </Stack>
        
        <DeliveriesBody
          templateUriTemplate={templateUriTemplate}
          originUriTemplate={originUriTemplate}
          userId={userId}
          groupId={groupId}
          columnAllowList={columnAllowList}
          journeyId={journeyId}
          triggeringProperties={triggeringProperties}
          broadcastId={broadcastId}
          broadcastUriTemplate={broadcastUriTemplate}
          templateIds={deliveriesFilters.templateIds}
          channels={deliveriesFilters.channels}
          to={deliveriesFilters.to}
          statuses={deliveriesFilters.statuses}
          from={deliveriesFilters.from}
          startDate={state.dateRange.startDate}
          endDate={state.dateRange.endDate}
        />
      </Stack>
    </>
  );
}