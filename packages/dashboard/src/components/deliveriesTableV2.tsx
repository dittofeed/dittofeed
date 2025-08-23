import {
  ArrowDownward as ArrowDownwardIcon,
  ArrowUpward as ArrowUpwardIcon,
  Bolt as BoltIcon,
  Clear as ClearIcon,
  DownloadForOffline,
  Refresh as RefreshIcon,
  SwapVert as SwapVertIcon,
} from "@mui/icons-material";
import {
  Divider,
  IconButton,
  MenuItem,
  Popover,
  Select,
  Snackbar,
  Stack,
  Tooltip,
} from "@mui/material";
import { subMinutes } from "date-fns";
import {
  ChannelType,
  DeliveriesAllowedColumn,
  SearchDeliveriesRequest,
  SearchDeliveriesRequestSortBy,
  SearchDeliveriesRequestSortByEnum,
  SortDirection,
  SortDirectionEnum,
} from "isomorphic-lib/src/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useImmer } from "use-immer";
import { useInterval } from "usehooks-ts";

import { useDownloadDeliveriesMutation } from "../lib/useDownloadDeliveriesMutation";
import {
  DateRangeSelector,
  DateRangeValue,
  TimeOptionId,
} from "./dateRangeSelector";
import {
  getFilterValues,
  NewDeliveriesFilterButton,
  SelectedDeliveriesFilters,
  useDeliveriesFilterState,
} from "./deliveries/deliveriesFilter";
import { DEFAULT_ALLOWED_COLUMNS } from "./deliveriesTableV2/constants";
import {
  createDownloadParams,
  DeliveriesBody,
  DeliveriesBodyState,
  getSortByLabel,
  SetDeliveriesBodyState,
  useDeliveryBodyState,
} from "./deliveriesTableV2/deliveriesBody";
import { GreyButton, greyButtonStyle } from "./greyButtonStyle";
import { greyMenuItemStyles, greySelectStyles } from "./greyScaleStyles";

interface State {
  dateRange: DateRangeValue;
  referenceDate: Date;
  query: {
    limit: number;
    sortBy: SearchDeliveriesRequestSortBy;
    sortDirection: SortDirection;
  };
  autoReload: boolean;
  deliveriesBody: DeliveriesBodyState;
}

const defaultTimeOptionId = TimeOptionId.Last24Hours;

const timeOptions = [
  {
    type: "minutes" as const,
    id: TimeOptionId.LastHour,
    minutes: 60,
    label: "Last hour",
  },
  {
    type: "minutes" as const,
    id: TimeOptionId.Last24Hours,
    minutes: 24 * 60,
    label: "Last 24 hours",
  },
  {
    type: "minutes" as const,
    id: TimeOptionId.LastSevenDays,
    minutes: 7 * 24 * 60,
    label: "Last 7 days",
  },
  {
    type: "minutes" as const,
    id: TimeOptionId.LastThirtyDays,
    minutes: 30 * 24 * 60,
    label: "Last 30 days",
  },
  {
    type: "minutes" as const,
    id: TimeOptionId.LastNinetyDays,
    minutes: 90 * 24 * 60,
    label: "Last 90 days",
  },
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
  contextValues?: SearchDeliveriesRequest["contextValues"];
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
  contextValues,
  broadcastId,
  autoReloadByDefault = false,
  reloadPeriodMs = 30000,
  broadcastUriTemplate,
  defaultTimeOption: defaultTimeOptionOverride = defaultTimeOptionId,
}: DeliveriesTableV2Props) {
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const downloadMutation = useDownloadDeliveriesMutation({
    onSuccess: () => {
      setSnackbarMessage("Downloaded deliveries CSV.");
      setSnackbarOpen(true);
    },
    onError: (error) => {
      setSnackbarMessage(`Download failed: ${error.message}`);
      setSnackbarOpen(true);
    },
  });

  const [deliveriesFilterState, setDeliveriesFilterState] =
    useDeliveriesFilterState();
  const initialEndDate = useMemo(() => new Date(), []);
  const defaultOption = timeOptions.find(
    (o) => o.id === defaultTimeOptionOverride,
  );
  const initialStartDate = useMemo(
    () =>
      defaultOption && defaultOption.type === "minutes"
        ? subMinutes(initialEndDate, defaultOption.minutes)
        : subMinutes(initialEndDate, 7 * 24 * 60), // fallback to 7 days
    [initialEndDate, defaultOption],
  );

  const [state, setState] = useImmer<State>({
    dateRange: {
      startDate: initialStartDate,
      endDate: initialEndDate,
      selectedTimeOption: defaultTimeOptionOverride,
    },
    referenceDate: new Date(),
    query: {
      limit: 10,
      sortBy: "sentAt",
      sortDirection: SortDirectionEnum.Desc,
    },
    autoReload: autoReloadByDefault,
    deliveriesBody: {
      previewMessageId: null,
      cursor: null,
    },
  });

  useInterval(
    () => {
      setState((draft) => {
        const selectedOption = timeOptions.find(
          (o) => o.id === draft.dateRange.selectedTimeOption,
        );
        if (selectedOption && selectedOption.type === "minutes") {
          const now = new Date();
          draft.dateRange.endDate = now;
          draft.dateRange.startDate = subMinutes(now, selectedOption.minutes);
        }
      });
    },
    state.autoReload && state.dateRange.selectedTimeOption !== "custom"
      ? reloadPeriodMs
      : null,
  );

  const templateIds = getFilterValues(deliveriesFilterState, "template");
  const channels = getFilterValues(deliveriesFilterState, "channel") as
    | ChannelType[]
    | undefined;
  const to = getFilterValues(deliveriesFilterState, "to");
  const statuses = getFilterValues(deliveriesFilterState, "status");
  const from = getFilterValues(deliveriesFilterState, "from");

  const deliveriesBodyHookProps = {
    userId,
    groupId,
    journeyId,
    triggeringProperties,
    contextValues,
    broadcastId,
    templateIds,
    channels,
    to,
    statuses,
    from,
    startDate: state.dateRange.startDate.toISOString(),
    endDate: state.dateRange.endDate.toISOString(),
    sortBy: state.query.sortBy,
    sortDirection: state.query.sortDirection,
    limit: state.query.limit,
  };

  const deliveriesBodyState = useDeliveryBodyState(deliveriesBodyHookProps);

  const downloadParams = useMemo(() => {
    const downloadTemplateIds = getFilterValues(
      deliveriesFilterState,
      "template",
    );
    const downloadChannels = getFilterValues(
      deliveriesFilterState,
      "channel",
    ) as ChannelType[] | undefined;
    const downloadTo = getFilterValues(deliveriesFilterState, "to");
    const downloadStatuses = getFilterValues(deliveriesFilterState, "status");
    const downloadFrom = getFilterValues(deliveriesFilterState, "from");

    const params = {
      templateIds: downloadTemplateIds,
      channels: downloadChannels,
      to: downloadTo,
      statuses: downloadStatuses,
      from: downloadFrom,
      startDate: state.dateRange.startDate.toISOString(),
      endDate: state.dateRange.endDate.toISOString(),
      sortBy: state.query.sortBy,
      sortDirection: state.query.sortDirection,
      userId,
      groupId,
      journeyId,
      triggeringProperties,
      contextValues,
      broadcastId,
    };

    return createDownloadParams(params);
  }, [
    deliveriesFilterState,
    state.dateRange,
    state.query,
    userId,
    groupId,
    journeyId,
    triggeringProperties,
    contextValues,
    broadcastId,
  ]);

  // Auto-extend date range to 90 days if initial load returns empty results
  useEffect(() => {
    if (
      !deliveriesBodyState.query.isLoading &&
      deliveriesBodyState.data &&
      deliveriesBodyState.data.length === 0 &&
      state.dateRange.selectedTimeOption === defaultTimeOptionId // Only for default time option
    ) {
      setState((draft) => {
        draft.dateRange.selectedTimeOption = TimeOptionId.LastNinetyDays;
        const ninetyDaysOption = timeOptions.find(
          (o) => o.id === TimeOptionId.LastNinetyDays,
        );
        if (ninetyDaysOption && ninetyDaysOption.type === "minutes") {
          draft.dateRange.startDate = subMinutes(
            draft.referenceDate,
            ninetyDaysOption.minutes,
          );
          draft.dateRange.endDate = draft.referenceDate;
        }
      });
    }
  }, [
    deliveriesBodyState.query.isLoading,
    deliveriesBodyState.data,
    state.dateRange.selectedTimeOption,
    setState,
  ]);

  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const setDeliveriesBodyState: SetDeliveriesBodyState = useCallback(
    (updater) => {
      setState((draft) => {
        if (typeof updater === "function") {
          updater(draft.deliveriesBody);
        } else {
          draft.deliveriesBody = updater;
        }
      });
    },
    [setState],
  );
  const handleDateRangeChange = useCallback(
    (newDateRange: DateRangeValue) => {
      setState((draft) => {
        draft.dateRange = newDateRange;
        draft.deliveriesBody.cursor = null; // Reset pagination when date range changes
      });
    },
    [setState],
  );

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
          <DateRangeSelector
            value={state.dateRange}
            onChange={handleDateRangeChange}
            referenceDate={state.referenceDate}
          />
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
          {(state.query.sortBy !== "sentAt" ||
            state.query.sortDirection !== SortDirectionEnum.Desc) && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                border: "1px solid",
                borderColor: "grey.400",
                borderRadius: 1,
                pl: 1,
                pr: 1,
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ pt: 1, pb: 1 }}
              >
                {getSortByLabel(state.query.sortBy)}
                {state.query.sortDirection === SortDirectionEnum.Asc ? (
                  <ArrowUpwardIcon fontSize="small" />
                ) : (
                  <ArrowDownwardIcon fontSize="small" />
                )}
              </Stack>
              <IconButton
                size="small"
                onClick={() => {
                  setState((draft) => {
                    draft.query.sortBy = "sentAt";
                    draft.query.sortDirection = SortDirectionEnum.Desc;
                    draft.deliveriesBody.cursor = null;
                  });
                }}
              >
                <ClearIcon />
              </IconButton>
            </Stack>
          )}
          <Tooltip title="Download deliveries as CSV" placement="bottom-start">
            <GreyButton
              onClick={() => {
                if (downloadParams) {
                  downloadMutation.mutate(downloadParams);
                }
              }}
              startIcon={<DownloadForOffline />}
            >
              Download Deliveries
            </GreyButton>
          </Tooltip>
          <GreyButton
            startIcon={<SwapVertIcon />}
            sx={{
              border: "1px solid",
              borderColor: "grey.400",
              backgroundColor: "white",
            }}
            onClick={(e) => {
              setAnchorEl(e.currentTarget);
            }}
          >
            Sort
          </GreyButton>
          <Popover
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            slotProps={{
              paper: {
                elevation: 3,
                sx: {
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "grey.400",
                  p: 2,
                },
              },
            }}
            onClose={() => {
              setAnchorEl(null);
            }}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "right",
            }}
            transformOrigin={{
              vertical: "top",
              horizontal: "right",
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="center"
              spacing={1}
            >
              <Select
                value={state.query.sortBy}
                sx={greySelectStyles}
                onChange={(e) => {
                  setState((draft) => {
                    draft.query.sortBy = e.target
                      .value as SearchDeliveriesRequestSortBy;
                    draft.deliveriesBody.cursor = null;
                  });
                }}
                MenuProps={{
                  sx: greyMenuItemStyles,
                  anchorOrigin: {
                    vertical: "bottom",
                    horizontal: "right",
                  },
                  transformOrigin: {
                    vertical: "top",
                    horizontal: "right",
                  },
                }}
              >
                <MenuItem value={SearchDeliveriesRequestSortByEnum.sentAt}>
                  {getSortByLabel(SearchDeliveriesRequestSortByEnum.sentAt)}
                </MenuItem>
                <MenuItem value={SearchDeliveriesRequestSortByEnum.from}>
                  {getSortByLabel(SearchDeliveriesRequestSortByEnum.from)}
                </MenuItem>
                <MenuItem value={SearchDeliveriesRequestSortByEnum.to}>
                  {getSortByLabel(SearchDeliveriesRequestSortByEnum.to)}
                </MenuItem>
                <MenuItem value={SearchDeliveriesRequestSortByEnum.status}>
                  {getSortByLabel(SearchDeliveriesRequestSortByEnum.status)}
                </MenuItem>
              </Select>
              <Select
                value={state.query.sortDirection}
                sx={greySelectStyles}
                onChange={(e) => {
                  setState((draft) => {
                    draft.query.sortDirection = e.target.value as SortDirection;
                    draft.deliveriesBody.cursor = null;
                  });
                }}
                MenuProps={{
                  sx: greyMenuItemStyles,
                  anchorOrigin: {
                    vertical: "bottom",
                    horizontal: "right",
                  },
                  transformOrigin: {
                    vertical: "top",
                    horizontal: "right",
                  },
                }}
              >
                <MenuItem value={SortDirectionEnum.Asc}>Asc</MenuItem>
                <MenuItem value={SortDirectionEnum.Desc}>Desc</MenuItem>
              </Select>
            </Stack>
          </Popover>
          <Tooltip title="Refresh Results" placement="bottom-start">
            <IconButton
              disabled={state.dateRange.selectedTimeOption === "custom"}
              onClick={() => {
                setState((draft) => {
                  const option = timeOptions.find(
                    (o) => o.id === draft.dateRange.selectedTimeOption,
                  );
                  if (option === undefined || option.type !== "minutes") {
                    return;
                  }
                  draft.deliveriesBody.cursor = null;
                  const endDate = new Date();
                  draft.dateRange.endDate = endDate;
                  draft.dateRange.startDate = subMinutes(
                    endDate,
                    option.minutes,
                  );
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
              disabled={state.dateRange.selectedTimeOption === "custom"}
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
          {...deliveriesBodyHookProps}
          templateUriTemplate={templateUriTemplate}
          originUriTemplate={originUriTemplate}
          broadcastUriTemplate={broadcastUriTemplate}
          columnAllowList={columnAllowList}
          state={state.deliveriesBody}
          setState={setDeliveriesBodyState}
        />
      </Stack>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}
