import { CalendarDate } from "@internationalized/date";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import {
  Box,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tooltip,
} from "@mui/material";
import { keepPreviousData } from "@tanstack/react-query";
import { subDays, subMinutes } from "date-fns";
import {
  ChannelType,
  ChartDataPoint,
  SearchDeliveriesRequestSortBy,
  SearchDeliveriesRequestSortByEnum,
  SortDirection,
  SortDirectionEnum,
} from "isomorphic-lib/src/types";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Legend,
  LegendPayload,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useImmer } from "use-immer";

import { expandCascadingMessageFilters } from "../lib/cascadingMessageFilters";
import { toCalendarDate } from "../lib/dates";
import { useAnalysisChartQuery } from "../lib/useAnalysisChartQuery";
import {
  FilterType,
  getFilterValues,
  NewAnalysisFilterButton,
  SelectedAnalysisFilters,
  useAnalysisFiltersState,
} from "./analysisChart/analysisChartFilters";
import {
  AnalysisChartGroupBy,
  GroupByOption,
} from "./analysisChart/analysisChartGroupBy";
import { AnalysisSummaryPanel } from "./analysisChart/analysisSummaryPanel";
import { DeliveriesBody } from "./deliveriesTableV2/deliveriesBody";
import { DeliveriesDownloadButton } from "./deliveriesTableV2/deliveriesDownloadButton";
import { DeliveriesSortButton } from "./deliveriesTableV2/deliveriesSortButton";
import { greyMenuItemStyles, greySelectStyles } from "./greyScaleStyles";
import { SharedFilterContainer } from "./shared/filterStyles";

interface MinuteTimeOption {
  type: "minutes";
  id: string;
  minutes: number;
  label: string;
}

interface CustomTimeOption {
  type: "custom";
  id: "custom";
  label: string;
}

type TimeOption = MinuteTimeOption | CustomTimeOption;

const defaultTimeOption = {
  type: "minutes",
  id: "last-7-days",
  minutes: 7 * 24 * 60,
  label: "Last 7 days",
} as const;

const defaultTimeOptionId = defaultTimeOption.id;

const timeOptions: TimeOption[] = [
  {
    type: "minutes",
    id: "last-15-minutes",
    minutes: 15,
    label: "Last 15 minutes",
  },
  {
    type: "minutes",
    id: "last-30-minutes",
    minutes: 30,
    label: "Last 30 minutes",
  },
  { type: "minutes", id: "last-hour", minutes: 60, label: "Last hour" },
  {
    type: "minutes",
    id: "last-24-hours",
    minutes: 24 * 60,
    label: "Last 24 hours",
  },
  defaultTimeOption,
  {
    type: "minutes",
    id: "last-30-days",
    minutes: 30 * 24 * 60,
    label: "Last 30 days",
  },
  {
    type: "minutes",
    id: "last-90-days",
    minutes: 90 * 24 * 60,
    label: "Last 90 days",
  },
  { type: "custom", id: "custom", label: "Custom Date Range" },
];

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTimestampForGranularity(timestamp: string, granularity: string) {
  const date = new Date(timestamp);

  switch (granularity) {
    case "30second":
    case "1minute":
    case "5minutes":
    case "10minutes":
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    case "30minutes":
    case "1hour":
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    case "6hours":
    case "12hours":
      return `${date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      })} ${date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    case "1day":
    case "7days":
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    case "30days":
      return date.toLocaleDateString([], { month: "short", year: "numeric" });
    default:
      return date.toLocaleDateString();
  }
}

interface State {
  selectedTimeOption: string;
  referenceDate: Date;
  customDateRange: {
    start: CalendarDate;
    end: CalendarDate;
  } | null;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  groupBy: GroupByOption;
  sortBy: SearchDeliveriesRequestSortBy;
  sortDirection: SortDirection;
  displayMode: "absolute" | "percentage";
}

// Custom Legend component with hover interaction
function CustomLegend(props: { payload?: readonly LegendPayload[] }) {
  const { payload } = props;
  
  if (!payload) return null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {payload.map((entry) => {
        const value = entry.value || "";
        return (
          <Box
            key={value}
            sx={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              fontSize: "14px",
              color: "#333",
            }}
          >
            <Box
              sx={{
                width: "12px",
                height: "2px",
                backgroundColor: entry.color,
                marginRight: 1,
              }}
            />
            <Box component="span">
              {value}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

export function AnalysisChart() {
  const initialEndDate = useMemo(() => Date.now(), []);
  const initialStartDate = useMemo(
    () => subMinutes(initialEndDate, defaultTimeOption.minutes).getTime(),
    [initialEndDate],
  );

  const [filtersState, setFiltersState] = useAnalysisFiltersState();

  // Translate analysis filters to deliveries filter props
  const deliveriesFilters = useMemo(() => {
    const selectedStatuses = getFilterValues(filtersState, "messageStates");
    return {
      templateIds: getFilterValues(filtersState, "templates"),
      channels: getFilterValues(filtersState, "channels") as
        | ChannelType[]
        | undefined,
      statuses: selectedStatuses
        ? expandCascadingMessageFilters(selectedStatuses)
        : undefined,
      journeyIds: getFilterValues(filtersState, "journeys"),
      broadcastIds: getFilterValues(filtersState, "broadcasts"),
      // Note: to, from would come from other analysis filters if they exist
    };
  }, [filtersState]);

  const [state, setState] = useImmer<State>({
    selectedTimeOption: defaultTimeOptionId,
    referenceDate: new Date(initialEndDate),
    customDateRange: null,
    dateRange: {
      startDate: new Date(initialStartDate).toISOString(),
      endDate: new Date(initialEndDate).toISOString(),
    },
    groupBy: null,
    sortBy: SearchDeliveriesRequestSortByEnum.sentAt,
    sortDirection: SortDirectionEnum.Desc,
    displayMode: "absolute",
  });

  // Build filters object from filter state
  const filters = useMemo(() => {
    const journeyIds = getFilterValues(filtersState, "journeys");
    const broadcastIds = getFilterValues(filtersState, "broadcasts");
    const channels = getFilterValues(filtersState, "channels");
    const providers = getFilterValues(filtersState, "providers");
    const messageStates = getFilterValues(filtersState, "messageStates");
    const templateIds = getFilterValues(filtersState, "templates");

    // Apply cascading logic to message states for chart data
    const expandedMessageStates = messageStates
      ? expandCascadingMessageFilters(messageStates)
      : undefined;

    // Only return filters object if at least one filter is set
    if (
      !journeyIds &&
      !broadcastIds &&
      !channels &&
      !providers &&
      !expandedMessageStates &&
      !templateIds
    ) {
      return undefined;
    }

    return {
      ...(journeyIds && { journeyIds }),
      ...(broadcastIds && { broadcastIds }),
      ...(channels && { channels }),
      ...(providers && { providers }),
      ...(expandedMessageStates && { messageStates: expandedMessageStates }),
      ...(templateIds && { templateIds }),
    };
  }, [filtersState]);

  const chartQuery = useAnalysisChartQuery(
    {
      startDate: state.dateRange.startDate,
      endDate: state.dateRange.endDate,
      granularity: "auto",
      ...(state.groupBy && { groupBy: state.groupBy }),
      ...(filters && { filters }),
    },
    {
      placeholderData: keepPreviousData,
    },
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

  const onRefresh = useCallback(() => {
    setState((draft) => {
      const option = timeOptions.find((o) => o.id === draft.selectedTimeOption);
      if (option === undefined || option.type !== "minutes") {
        return;
      }
      const endDate = new Date();
      const startDate = subMinutes(endDate, option.minutes);
      draft.dateRange = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      };
      draft.referenceDate = endDate;
    });
  }, [setState]);

  const handleChannelSelect = useCallback(
    (channel: ChannelType) => {
      setFiltersState((draft) => {
        // Add or update channel filter
        const channelFilter = {
          type: FilterType.MultiSelect,
          value: new Map([[channel, channel]]),
        };
        draft.filters.set("channels", channelFilter);
      });
    },
    [setFiltersState],
  );

  // Handle sort changes for deliveries table
  const handleSortChange = useCallback(
    (sortBy: SearchDeliveriesRequestSortBy, sortDirection: SortDirection) => {
      setState((draft) => {
        draft.sortBy = sortBy;
        draft.sortDirection = sortDirection;
      });
    },
    [setState],
  );

  // Create resolved query params for download functionality
  const resolvedQueryParams = useMemo(() => {
    return {
      ...deliveriesFilters,
      startDate: state.dateRange.startDate,
      endDate: state.dateRange.endDate,
      sortBy: state.sortBy,
      sortDirection: state.sortDirection,
    };
  }, [
    deliveriesFilters,
    state.dateRange.startDate,
    state.dateRange.endDate,
    state.sortBy,
    state.sortDirection,
  ]);

  // Transform chart data for recharts
  const chartData = useMemo(() => {
    if (!chartQuery.data?.data) return [];

    // Group data by timestamp and create chart points
    const grouped = new Map<string, Record<string, string | number>>();
    const groups = new Set<string>();

    chartQuery.data.data.forEach((point: ChartDataPoint) => {
      const timestamp = new Date(point.timestamp).toISOString();
      const groupLabel = point.groupLabel ?? "Total";

      groups.add(groupLabel);

      if (!grouped.has(timestamp)) {
        grouped.set(timestamp, { timestamp });
      }

      const entry = grouped.get(timestamp);
      if (entry) {
        entry[groupLabel] = point.count;
      }
    });

    const sortedData = Array.from(grouped.values()).sort((a, b) => {
      const aTime =
        typeof a.timestamp === "string" ? new Date(a.timestamp).getTime() : 0;
      const bTime =
        typeof b.timestamp === "string" ? new Date(b.timestamp).getTime() : 0;
      return aTime - bTime;
    });

    // Apply percentage calculation if in percentage mode
    if (state.displayMode === "percentage") {
      return sortedData.map((dataPoint) => {
        if (typeof dataPoint.timestamp !== "string") {
          return dataPoint; // Skip if timestamp is not a string
        }
        const result: Record<string, string | number> = {
          timestamp: dataPoint.timestamp,
        };

        // Different percentage logic based on groupBy type
        if (state.groupBy === "messageState") {
          // For message state grouping: use "sent" as baseline (100%)
          let baseline = 0;
          const sentKey = Array.from(groups).find(group => 
            group.toLowerCase().includes("sent")
          );
          
          if (sentKey) {
            const sentValue = dataPoint[sentKey];
            baseline = typeof sentValue === "number" ? sentValue : 0;
          }

          // Convert each group's value to percentage of sent
          Array.from(groups).forEach((group) => {
            const value = dataPoint[group];
            if (typeof value === "number") {
              if (group === sentKey) {
                result[group] = 100; // Sent is always 100%
              } else if (baseline > 0) {
                result[group] = Math.round((value / baseline) * 10000) / 100;
              } else {
                result[group] = 0;
              }
            } else {
              result[group] = 0;
            }
          });
        } else {
          // For other groupings (journey, template, etc.): use total as baseline
          const total = Array.from(groups).reduce((sum, group) => {
            const value = dataPoint[group];
            return sum + (typeof value === "number" ? value : 0);
          }, 0);

          // Convert each group's value to percentage of total
          Array.from(groups).forEach((group) => {
            const value = dataPoint[group];
            if (typeof value === "number" && total > 0) {
              result[group] = Math.round((value / total) * 10000) / 100;
            } else {
              result[group] = 0;
            }
          });
        }

        return result;
      });
    }

    return sortedData;
  }, [chartQuery.data, state.displayMode]);

  const legendData = useMemo(() => {
    if (!chartQuery.data?.data) return [];

    const groups = new Set<string>();
    chartQuery.data.data.forEach((point: ChartDataPoint) => {
      const groupLabel = point.groupLabel ?? "Total";
      groups.add(groupLabel);
    });

    return Array.from(groups);
  }, [chartQuery.data]);

  // Colors for different lines
  const colors = [
    "#8884d8",
    "#82ca9d",
    "#ffc658",
    "#ff7300",
    "#00ff00",
    "#0088fe",
  ];

  return (
    <Stack spacing={1}>
      {/* Chart Container */}
      <Box sx={{ height: "400px" }}>
        <Stack spacing={1} sx={{ height: "100%" }}>
          {/* Header with controls */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ height: "48px" }}
          >
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              flex={1}
              sx={{ height: "100%" }}
            >
              <FormControl size="small">
                <Select
                  value={state.selectedTimeOption}
                  renderValue={(value) => {
                    const option = timeOptions.find((o) => o.id === value);
                    if (option?.type === "custom") {
                      return `${formatDate(new Date(state.dateRange.startDate))} - ${formatDate(new Date(state.dateRange.endDate))}`;
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
                      const endDate = draft.referenceDate;
                      const startDate = subMinutes(endDate, option.minutes);
                      draft.dateRange = {
                        startDate: startDate.toISOString(),
                        endDate: endDate.toISOString(),
                      };
                    })
                  }
                >
                  {timeOptions.map((option) => (
                    <MenuItem
                      key={option.id}
                      value={option.id}
                      onClick={
                        option.id === "custom"
                          ? customOnClickHandler
                          : undefined
                      }
                    >
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Filters */}
              <SharedFilterContainer>
                <NewAnalysisFilterButton
                  state={filtersState}
                  setState={setFiltersState}
                  greyScale
                />
                <SelectedAnalysisFilters
                  state={filtersState}
                  setState={setFiltersState}
                  sx={{
                    height: "100%",
                  }}
                />

                {/* Group By */}
                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{ borderColor: "grey.300" }}
                />
                <AnalysisChartGroupBy
                  value={state.groupBy}
                  onChange={(value) =>
                    setState((draft) => {
                      draft.groupBy = value;
                    })
                  }
                  greyScale
                />
              </SharedFilterContainer>
            </Stack>

            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ height: "100%" }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={state.displayMode === "percentage"}
                    onChange={(e) =>
                      setState((draft) => {
                        draft.displayMode = e.target.checked
                          ? "percentage"
                          : "absolute";
                      })
                    }
                    size="small"
                  />
                }
                label="Show %"
                sx={{
                  marginRight: 0,
                  "& .MuiFormControlLabel-label": {
                    fontSize: "14px",
                    color: "text.secondary",
                  },
                }}
              />
              <DeliveriesDownloadButton
                resolvedQueryParams={resolvedQueryParams}
              />
              <DeliveriesSortButton
                sortBy={state.sortBy}
                sortDirection={state.sortDirection}
                onSortChange={handleSortChange}
              />
              <Tooltip title="Refresh Results" placement="bottom-start">
                <IconButton
                  disabled={state.selectedTimeOption === "custom"}
                  onClick={onRefresh}
                  sx={{
                    border: "1px solid",
                    borderColor: "grey.400",
                  }}
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {/* Custom date range popover would go here (similar to userEventsTable) */}

          {/* Chart */}
          <Paper sx={{ flex: 1, width: "100%", p: 1 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(value) =>
                    chartQuery.data?.granularity
                      ? formatTimestampForGranularity(
                          value,
                          chartQuery.data.granularity,
                        )
                      : new Date(value).toLocaleDateString()
                  }
                />
                <YAxis
                  label={{
                    value:
                      state.displayMode === "percentage"
                        ? "Percentage (%)"
                        : "Messages",
                    angle: -90,
                    position: "insideLeft",
                    style: { textAnchor: "middle" },
                  }}
                />
                <RechartsTooltip
                  labelFormatter={(value) => new Date(value).toLocaleString()}
                  formatter={(value: number, name: string) => {
                    if (state.displayMode === "percentage") {
                      return [`${value.toFixed(1)}%`, name];
                    }
                    return [value.toLocaleString(), name];
                  }}
                />
                <Legend
                  align="right"
                  verticalAlign="middle"
                  layout="vertical"
                  content={CustomLegend}
                />
                {legendData.map((group, index) => (
                  <Line
                    key={group}
                    type="monotone"
                    dataKey={group}
                    stroke={colors[index % colors.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Stack>
      </Box>

      {/* Summary Panel - Separate Container */}
      <AnalysisSummaryPanel
        dateRange={state.dateRange}
        filtersState={filtersState}
        onChannelSelect={handleChannelSelect}
        displayMode={state.displayMode}
      />

      {/* Deliveries Table */}
      <DeliveriesBody
        templateIds={deliveriesFilters.templateIds}
        channels={deliveriesFilters.channels}
        statuses={deliveriesFilters.statuses}
        journeyIds={deliveriesFilters.journeyIds}
        broadcastIds={deliveriesFilters.broadcastIds}
        startDate={new Date(state.dateRange.startDate)}
        endDate={new Date(state.dateRange.endDate)}
        sortBy={state.sortBy}
        sortDirection={state.sortDirection}
        limit={5}
      />
    </Stack>
  );
}
