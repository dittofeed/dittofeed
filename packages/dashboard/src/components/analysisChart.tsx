import { CalendarDate } from "@internationalized/date";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import {
  Box,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData } from "@tanstack/react-query";
import { subDays, subMinutes } from "date-fns";
import { ChartDataPoint } from "isomorphic-lib/src/types";
import { useCallback, useMemo, useRef } from "react";
import { Updater, useImmer } from "use-immer";
import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { toCalendarDate } from "../lib/dates";
import { useAnalysisChartQuery } from "../lib/useAnalysisChartQuery";
import {
  getFilterValues,
  NewAnalysisFilterButton,
  SelectedAnalysisFilters,
  useAnalysisFiltersState,
} from "./analysisChart/analysisChartFilters";
import { greyMenuItemStyles, greySelectStyles } from "./greyScaleStyles";
import { RangeCalendar } from "./rangeCalendar";

const TimeOptionId = {
  Last15Minutes: "last-15-minutes",
  Last30Minutes: "last-30-minutes",
  LastHour: "last-hour",
  Last24Hours: "last-24-hours",
  LastSevenDays: "last-7-days",
  LastThirtyDays: "last-30-days",
  LastNinetyDays: "last-90-days",
  Custom: "custom",
} as const;

type TimeOptionId = (typeof TimeOptionId)[keyof typeof TimeOptionId];

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
  { type: "minutes", id: "last-15-minutes", minutes: 15, label: "Last 15 minutes" },
  { type: "minutes", id: "last-30-minutes", minutes: 30, label: "Last 30 minutes" },
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

function formatCalendarDate(date: CalendarDate) {
  return formatDate(
    date.toDate(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
}

function formatTimestampForGranularity(timestamp: string, granularity: string) {
  const date = new Date(timestamp);
  
  switch (granularity) {
    case "30second":
    case "1minute":
    case "5minutes":
    case "10minutes":
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    case "30minutes":
    case "1hour":
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    case "6hours":
    case "12hours":
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + 
        ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    case "1day":
    case "7days":
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    case "30days":
      return date.toLocaleDateString([], { month: 'short', year: 'numeric' });
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
}

type SetState = Updater<State>;

interface AnalysisChartProps {}

export function AnalysisChart({}: AnalysisChartProps) {
  const initialEndDate = useMemo(() => Date.now(), []);
  const initialStartDate = useMemo(
    () => subMinutes(initialEndDate, defaultTimeOption.minutes).getTime(),
    [initialEndDate],
  );

  const [filtersState, setFiltersState] = useAnalysisFiltersState();

  const [state, setState] = useImmer<State>({
    selectedTimeOption: defaultTimeOptionId,
    referenceDate: new Date(initialEndDate),
    customDateRange: null,
    dateRange: {
      startDate: new Date(initialStartDate).toISOString(),
      endDate: new Date(initialEndDate).toISOString(),
    },
  });

  // Build filters object from filter state
  const filters = useMemo(() => {
    const journeyIds = getFilterValues(filtersState, "journeys");
    const broadcastIds = getFilterValues(filtersState, "broadcasts");
    const channels = getFilterValues(filtersState, "channels");
    const providers = getFilterValues(filtersState, "providers");
    const messageStates = getFilterValues(filtersState, "messageStates");
    const templateIds = getFilterValues(filtersState, "templates");

    // Only return filters object if at least one filter is set
    if (
      !journeyIds &&
      !broadcastIds &&
      !channels &&
      !providers &&
      !messageStates &&
      !templateIds
    ) {
      return undefined;
    }

    return {
      ...(journeyIds && { journeyIds }),
      ...(broadcastIds && { broadcastIds }),
      ...(channels && { channels }),
      ...(providers && { providers }),
      ...(messageStates && { messageStates }),
      ...(templateIds && { templateIds }),
    };
  }, [filtersState]);

  const chartQuery = useAnalysisChartQuery(
    {
      startDate: state.dateRange.startDate,
      endDate: state.dateRange.endDate,
      granularity: "auto",
      displayMode: "absolute",
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
      const option = timeOptions.find(
        (o) => o.id === draft.selectedTimeOption,
      );
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

  // Transform chart data for recharts
  const chartData = useMemo(() => {
    if (!chartQuery.data?.data) return [];

    // Group data by timestamp and create chart points
    const grouped = new Map<string, Record<string, string | number>>();
    const groups = new Set<string>();

    chartQuery.data.data.forEach((point: ChartDataPoint) => {
      const timestamp = new Date(point.timestamp).toISOString();
      const groupKey = point.groupKey || "default";
      const groupLabel = point.groupLabel || "Total";
      
      groups.add(groupLabel);
      
      if (!grouped.has(timestamp)) {
        grouped.set(timestamp, { timestamp });
      }
      
      const entry = grouped.get(timestamp)!;
      entry[groupLabel] = point.value;
    });

    return Array.from(grouped.values()).sort(
      (a, b) => new Date(a.timestamp as string).getTime() - new Date(b.timestamp as string).getTime()
    );
  }, [chartQuery.data]);

  const legendData = useMemo(() => {
    if (!chartQuery.data?.data) return [];
    
    const groups = new Set<string>();
    chartQuery.data.data.forEach((point: ChartDataPoint) => {
      const groupLabel = point.groupLabel || "Total";
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
    <Paper sx={{ p: 3, height: "400px" }}>
      <Stack spacing={2} sx={{ height: "100%" }}>
        {/* Header with controls */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center" flex={1}>
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
                    const option = timeOptions.find((o) => o.id === e.target.value);
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
                      option.id === "custom" ? customOnClickHandler : undefined
                    }
                  >
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Filters */}
            <Stack direction="row" spacing={1} alignItems="center" flex={1}>
              <NewAnalysisFilterButton 
                state={filtersState} 
                setState={setFiltersState}
                greyScale
                buttonProps={{
                  size: "small",
                  disableRipple: true,
                  sx: {
                    backgroundColor: "grey.100",
                    color: "text.primary",
                    border: "1px solid",
                    borderColor: "grey.300",
                    fontWeight: "bold",
                    "&:hover": {
                      backgroundColor: "grey.200",
                      borderColor: "grey.400",
                    },
                  },
                }}
              />
              <SelectedAnalysisFilters 
                state={filtersState} 
                setState={setFiltersState}
              />
            </Stack>
          </Stack>
          
          <Stack direction="row" spacing={1} alignItems="center">
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
        <Box sx={{ flex: 1, width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={(value) => 
                  chartQuery.data?.granularity 
                    ? formatTimestampForGranularity(value, chartQuery.data.granularity)
                    : new Date(value).toLocaleDateString()
                }
              />
              <YAxis />
              <RechartsTooltip 
                labelFormatter={(value) => new Date(value).toLocaleString()}
              />
              <Legend />
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
        </Box>
      </Stack>
    </Paper>
  );
}