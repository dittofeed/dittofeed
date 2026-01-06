import { Refresh as RefreshIcon } from "@mui/icons-material";
import {
  Box,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData } from "@tanstack/react-query";
import { subMinutes } from "date-fns";
import {
  AnalysisChartConfiguration,
  ChannelType,
  ChartDataPoint,
  SearchDeliveriesRequestSortBy,
  SearchDeliveriesRequestSortByEnum,
  SortDirection,
  SortDirectionEnum,
} from "isomorphic-lib/src/types";
import { useCallback, useMemo } from "react";
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
import { useAnalysisChartQuery } from "../lib/useAnalysisChartQuery";
import { useResourcesQuery } from "../lib/useResourcesQuery";
import {
  FilterType,
  getFilterValues,
  MultiSelectFilter,
  NewAnalysisFilterButton,
  SelectedAnalysisFilters,
  useAnalysisFiltersState,
} from "./analysisChart/analysisChartFilters";
import {
  AnalysisChartGroupBy,
  GroupByOption,
} from "./analysisChart/analysisChartGroupBy";
import { AnalysisSummaryPanel } from "./analysisChart/analysisSummaryPanel";
import { DateRangeSelector } from "./dateRangeSelector";
import {
  DeliveriesBody,
  useDeliveryBodyState,
} from "./deliveriesTableV2/deliveriesBody";
import { DeliveriesDownloadButton } from "./deliveriesTableV2/deliveriesDownloadButton";
import { DeliveriesSortButton } from "./deliveriesTableV2/deliveriesSortButton";
import { SharedFilterContainer } from "./shared/filterStyles";

type TimeOption =
  | { type: "minutes"; id: string; minutes: number; label: string }
  | { type: "custom"; id: "custom"; label: string };

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

// Date label rendering is handled by DateRangeSelector

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
  const maxLength = 20; // Maximum characters to show before truncating

  if (!payload) return null;

  const truncateText = (text: string, maxLen: number) => {
    if (text.length <= maxLen) return text;
    return `${text.substring(0, maxLen)}...`;
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {payload.map((entry) => {
        const value = entry.value ?? "";
        const truncatedValue = truncateText(value, maxLength);
        const needsTruncation = value.length > maxLength;

        const legendItem = (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              fontSize: "14px",
              color: "#333",
              maxWidth: "200px", // Prevent legend from getting too wide
            }}
          >
            <Box
              sx={{
                width: "12px",
                height: "2px",
                backgroundColor: entry.color,
                marginRight: 1,
                flexShrink: 0, // Prevent the color indicator from shrinking
              }}
            />
            <Typography
              variant="body2"
              sx={{
                fontSize: "14px",
                color: "#333",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {truncatedValue}
            </Typography>
          </Box>
        );

        if (needsTruncation) {
          return (
            <Tooltip key={value} title={value} placement="left">
              {legendItem}
            </Tooltip>
          );
        }

        return <Box key={value}>{legendItem}</Box>;
      })}
    </Box>
  );
}

export interface AnalysisChartProps {
  configuration?: AnalysisChartConfiguration | null;
}

export function AnalysisChart({ configuration }: AnalysisChartProps = {}) {
  const initialEndDate = useMemo(() => Date.now(), []);
  const initialStartDate = useMemo(
    () => subMinutes(initialEndDate, defaultTimeOption.minutes).getTime(),
    [initialEndDate],
  );

  const [filtersState, setFiltersState] = useAnalysisFiltersState();

  // Extract configuration options
  const hardcodedFilters = configuration?.hardcodedFilters;
  const allowedFilters = configuration?.allowedFilters;
  const allowedGroupBy = configuration?.allowedGroupBy;
  const allowedChannels = configuration?.allowedChannels;
  const columnAllowList = configuration?.columnAllowList;
  const templateUriTemplate = configuration?.templateUriTemplate;
  const originUriTemplate = configuration?.originUriTemplate;

  // Translate analysis filters to deliveries filter props, merging with hardcoded filters
  const deliveriesFilters = useMemo(() => {
    const selectedStatuses = getFilterValues(filtersState, "messageStates");
    const dynamicTemplateIds = getFilterValues(filtersState, "templateIds");
    const dynamicChannels = getFilterValues(filtersState, "channels");
    const dynamicJourneyIds = getFilterValues(filtersState, "journeyIds");
    const dynamicBroadcastIds = getFilterValues(filtersState, "broadcastIds");

    // Merge hardcoded and dynamic filters (hardcoded takes precedence)
    const templateIds =
      hardcodedFilters?.templateIds ?? dynamicTemplateIds ?? undefined;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const channels = (hardcodedFilters?.channels ?? dynamicChannels) as
      | ChannelType[]
      | undefined;
    const journeyIds =
      hardcodedFilters?.journeyIds ?? dynamicJourneyIds ?? undefined;
    const broadcastIds =
      hardcodedFilters?.broadcastIds ?? dynamicBroadcastIds ?? undefined;

    // Merge message states
    const mergedStatuses = hardcodedFilters?.messageStates ?? selectedStatuses;
    const statuses = mergedStatuses
      ? expandCascadingMessageFilters(mergedStatuses)
      : undefined;

    return {
      templateIds,
      channels,
      statuses,
      journeyIds,
      broadcastIds,
      // Note: to, from would come from other analysis filters if they exist
    };
  }, [filtersState, hardcodedFilters]);

  const [state, setState] = useImmer<State>({
    selectedTimeOption: defaultTimeOptionId,
    referenceDate: new Date(initialEndDate),
    dateRange: {
      startDate: new Date(initialStartDate).toISOString(),
      endDate: new Date(initialEndDate).toISOString(),
    },
    groupBy: null,
    sortBy: SearchDeliveriesRequestSortByEnum.sentAt,
    sortDirection: SortDirectionEnum.Desc,
    displayMode: "absolute",
  });

  // Use the deliveries hook
  const deliveriesHookResult = useDeliveryBodyState({
    templateIds: deliveriesFilters.templateIds,
    channels: deliveriesFilters.channels,
    statuses: deliveriesFilters.statuses,
    journeyIds: deliveriesFilters.journeyIds,
    broadcastIds: deliveriesFilters.broadcastIds,
    startDate: state.dateRange.startDate,
    endDate: state.dateRange.endDate,
    sortBy: state.sortBy,
    sortDirection: state.sortDirection,
    limit: 5,
  });

  // Build filters object from filter state, merging with hardcoded filters
  const filters = useMemo(() => {
    const dynamicJourneyIds = getFilterValues(filtersState, "journeyIds");
    const dynamicBroadcastIds = getFilterValues(filtersState, "broadcastIds");
    const dynamicChannels = getFilterValues(filtersState, "channels");
    const dynamicProviders = getFilterValues(filtersState, "providers");
    const dynamicMessageStates = getFilterValues(filtersState, "messageStates");
    const dynamicTemplateIds = getFilterValues(filtersState, "templateIds");
    const dynamicUserIds = getFilterValues(filtersState, "userIds");

    // Merge hardcoded and dynamic filters (hardcoded takes precedence)
    const journeyIds = hardcodedFilters?.journeyIds ?? dynamicJourneyIds;
    const broadcastIds = hardcodedFilters?.broadcastIds ?? dynamicBroadcastIds;
    const channels = hardcodedFilters?.channels ?? dynamicChannels;
    const providers = hardcodedFilters?.providers ?? dynamicProviders;
    const messageStates =
      hardcodedFilters?.messageStates ?? dynamicMessageStates;
    const templateIds = hardcodedFilters?.templateIds ?? dynamicTemplateIds;
    const userIds = hardcodedFilters?.userIds ?? dynamicUserIds;

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
      !templateIds &&
      !userIds
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
      ...(userIds && { userIds }),
    };
  }, [filtersState, hardcodedFilters]);

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

  // Fetch all resources for name lookup - unconditional to avoid latency when switching groupBy
  const resourcesQuery = useResourcesQuery(
    {
      journeys: true,
      broadcasts: true,
      messageTemplates: true,
    },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  );

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
        const channelFilter: MultiSelectFilter = {
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

  // Create ID to name mappings for all resource types
  const idToNameMaps = useMemo(() => {
    return {
      journey: new Map(
        resourcesQuery.data?.journeys?.map((journey) => [
          journey.id,
          journey.name,
        ]) ?? [],
      ),
      broadcast: new Map(
        resourcesQuery.data?.broadcasts?.map((broadcast) => [
          broadcast.id,
          broadcast.name,
        ]) ?? [],
      ),
      messageTemplate: new Map(
        resourcesQuery.data?.messageTemplates?.map((template) => [
          template.id,
          template.name,
        ]) ?? [],
      ),
    };
  }, [resourcesQuery.data]);

  // Helper function to map ID to name based on groupBy type
  const mapIdToName = useCallback(
    (id: string, groupBy: GroupByOption): string => {
      if (groupBy === null || id === "Total") {
        return id;
      }

      switch (groupBy) {
        case "journey":
          return idToNameMaps.journey.get(id) ?? id;
        case "broadcast":
          return idToNameMaps.broadcast.get(id) ?? id;
        case "messageTemplate":
          return idToNameMaps.messageTemplate.get(id) ?? id;
        case "channel":
        case "provider":
        case "messageState":
        default:
          return id;
      }
    },
    [idToNameMaps],
  );

  // Transform chart data for recharts
  const chartData = useMemo(() => {
    if (!chartQuery.data?.data) return [];

    // Group data by timestamp and create chart points
    const grouped = new Map<string, Record<string, string | number>>();
    const groups = new Set<string>();

    chartQuery.data.data.forEach((point: ChartDataPoint) => {
      const timestamp = new Date(point.timestamp).toISOString();
      const rawGroupLabel = point.groupLabel ?? "Total";

      // Map ID to name based on groupBy type
      const groupLabel = mapIdToName(rawGroupLabel, state.groupBy);

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
          const sentKey = Array.from(groups).find((group) =>
            group.toLowerCase().includes("sent"),
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
  }, [chartQuery.data, state.displayMode, state.groupBy, mapIdToName]);

  const legendData = useMemo(() => {
    if (!chartQuery.data?.data) return [];

    const groups = new Set<string>();
    chartQuery.data.data.forEach((point: ChartDataPoint) => {
      const rawGroupLabel = point.groupLabel ?? "Total";

      // Map ID to name based on groupBy type
      const groupLabel = mapIdToName(rawGroupLabel, state.groupBy);

      groups.add(groupLabel);
    });

    return Array.from(groups);
  }, [chartQuery.data, state.groupBy, mapIdToName]);

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
              <DateRangeSelector
                value={{
                  startDate: new Date(state.dateRange.startDate),
                  endDate: new Date(state.dateRange.endDate),
                  selectedTimeOption: state.selectedTimeOption,
                }}
                referenceDate={state.referenceDate}
                timeOptions={timeOptions}
                onChange={(newValue) =>
                  setState((draft) => {
                    draft.selectedTimeOption = newValue.selectedTimeOption;
                    draft.dateRange.startDate =
                      newValue.startDate.toISOString();
                    draft.dateRange.endDate = newValue.endDate.toISOString();
                  })
                }
              />

              {/* Filters */}
              <SharedFilterContainer>
                <NewAnalysisFilterButton
                  state={filtersState}
                  setState={setFiltersState}
                  greyScale
                  allowedFilters={allowedFilters}
                  allowedChannels={allowedChannels}
                />
                <SelectedAnalysisFilters
                  state={filtersState}
                  setState={setFiltersState}
                  hardcodedFilters={hardcodedFilters}
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
                  allowedGroupBy={allowedGroupBy}
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

          {/* Date range selection handled by DateRangeSelector */}

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
                  domain={
                    state.displayMode === "percentage" ? [0, 100] : [0, "auto"]
                  }
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
        allowedChannels={allowedChannels}
      />

      {/* Deliveries Table */}
      <DeliveriesBody
        templateIds={deliveriesFilters.templateIds}
        channels={deliveriesFilters.channels}
        statuses={deliveriesFilters.statuses}
        journeyIds={deliveriesFilters.journeyIds}
        broadcastIds={deliveriesFilters.broadcastIds}
        startDate={state.dateRange.startDate}
        endDate={state.dateRange.endDate}
        sortBy={state.sortBy}
        sortDirection={state.sortDirection}
        limit={5}
        state={deliveriesHookResult.state}
        setState={deliveriesHookResult.setState}
        columnAllowList={columnAllowList}
        templateUriTemplate={templateUriTemplate}
        originUriTemplate={originUriTemplate}
        headerCellSx={{
          paddingTop: "8px",
          paddingBottom: "8px",
        }}
        footerCellButtonProps={{ size: "small" }}
        footerCellSx={{
          paddingTop: "4px",
          paddingBottom: "4px",
        }}
      />
    </Stack>
  );
}
