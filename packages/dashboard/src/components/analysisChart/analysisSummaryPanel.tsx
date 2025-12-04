import { Email, Sms } from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { keepPreviousData } from "@tanstack/react-query";
import { ChannelType, SummaryMetric } from "isomorphic-lib/src/types";
import React, { useMemo } from "react";

import { useAnalysisSummaryQuery } from "../../lib/useAnalysisSummaryQuery";
import { greyButtonStyle } from "../greyButtonStyle";
import {
  AnalysisFilterKey,
  AnalysisFiltersState,
  FilterType,
} from "./analysisChartFilters";

interface AnalysisSummaryPanelProps {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  filtersState: AnalysisFiltersState;
  onChannelSelect: (channel: ChannelType) => void;
  displayMode: "absolute" | "percentage";
  allowedChannels?: ChannelType[];
}

interface MetricCardProps {
  title: string;
  value: number;
  isLoading?: boolean;
  isPercentage?: boolean;
}

function MetricCard({
  title,
  value,
  isLoading = false,
  isPercentage = false,
}: MetricCardProps) {
  return (
    <Card sx={{ minWidth: 80, textAlign: "center" }}>
      <CardContent sx={{ p: 0.5, "&:last-child": { pb: 0.5 } }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
        {isLoading ? (
          <Skeleton variant="text" width={40} height={20} sx={{ mx: "auto" }} />
        ) : (
          <Typography variant="subtitle2" component="div">
            {isPercentage ? `${value.toFixed(1)}%` : value.toLocaleString()}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalysisSummaryPanel({
  dateRange,
  filtersState,
  onChannelSelect,
  displayMode,
  allowedChannels,
}: AnalysisSummaryPanelProps) {
  // Helper to extract keys from a filter (handles both MultiSelect and Value types)
  const getFilterKeys = (
    filterKey: AnalysisFilterKey,
  ): string[] | undefined => {
    const filter = filtersState.filters.get(filterKey);
    if (!filter) return undefined;
    if (filter.type === FilterType.MultiSelect) {
      return Array.from(filter.value.keys());
    }
    // For Value filters, return the value as a single-item array
    return filter.value ? [filter.value] : undefined;
  };

  // Check if channel filter is already applied
  const hasChannelFilter = filtersState.filters.has("channels");
  const channelKeys = getFilterKeys("channels");
  const selectedChannel =
    hasChannelFilter && channelKeys?.[0]
      ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (channelKeys[0] as ChannelType)
      : undefined;

  // Build filters object from filter state
  const filters = useMemo(() => {
    const getKeys = (filterKey: AnalysisFilterKey): string[] | undefined => {
      const filter = filtersState.filters.get(filterKey);
      if (!filter) return undefined;
      if (filter.type === FilterType.MultiSelect) {
        return Array.from(filter.value.keys());
      }
      return filter.value ? [filter.value] : undefined;
    };

    const journeyIds = getKeys("journeyIds");
    const broadcastIds = getKeys("broadcastIds");
    const channels = getKeys("channels");
    const providers = getKeys("providers");
    const messageStates = getKeys("messageStates");
    const templateIds = getKeys("templateIds");

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

  const summaryQuery = useAnalysisSummaryQuery(
    {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      ...(filters || selectedChannel
        ? {
            filters: {
              ...filters,
              ...(selectedChannel && { channel: selectedChannel }),
            },
          }
        : {}),
    },
    {
      placeholderData: keepPreviousData,
    },
  );

  // Calculate percentage values when in percentage mode
  const summary = useMemo(() => {
    const rawSummary: SummaryMetric = summaryQuery.data?.summary ?? {
      sent: 0,
      deliveries: 0,
      opens: 0,
      clicks: 0,
      bounces: 0,
    };

    if (displayMode === "percentage" && rawSummary.sent > 0) {
      return {
        sent: 100, // Sent is always 100% in percentage mode
        deliveries: (rawSummary.deliveries / rawSummary.sent) * 100,
        opens: (rawSummary.opens / rawSummary.sent) * 100,
        clicks: (rawSummary.clicks / rawSummary.sent) * 100,
        bounces: (rawSummary.bounces / rawSummary.sent) * 100,
      };
    }
    return rawSummary;
  }, [summaryQuery.data?.summary, displayMode]);

  if (!hasChannelFilter) {
    // Show basic sent messages count with channel selection buttons
    return (
      <Box sx={{ py: 0.5 }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="center"
        >
          <MetricCard
            title="SENT"
            value={summary.sent}
            isLoading={summaryQuery.isLoading}
            isPercentage={displayMode === "percentage"}
          />
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Select a channel to see a detailed summary.
            </Typography>
            <Stack direction="row" spacing={0.5}>
              {(!allowedChannels ||
                allowedChannels.includes(ChannelType.Email)) && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Email />}
                  onClick={() => onChannelSelect(ChannelType.Email)}
                  disableRipple
                  sx={{
                    ...greyButtonStyle,
                    textTransform: "none",
                    fontWeight: "bold",
                  }}
                >
                  Email
                </Button>
              )}
              {(!allowedChannels ||
                allowedChannels.includes(ChannelType.Sms)) && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Sms />}
                  onClick={() => onChannelSelect(ChannelType.Sms)}
                  disableRipple
                  sx={{
                    ...greyButtonStyle,
                    textTransform: "none",
                    fontWeight: "bold",
                  }}
                >
                  SMS
                </Button>
              )}
            </Stack>
          </Stack>
        </Stack>
      </Box>
    );
  }

  // Show detailed summary for selected channel
  return (
    <Stack direction="row" spacing={1} justifyContent="center" sx={{ py: 0.5 }}>
      <MetricCard
        title="SENT"
        value={summary.sent}
        isLoading={summaryQuery.isLoading}
        isPercentage={displayMode === "percentage"}
      />
      <MetricCard
        title="DELIVERIES"
        value={summary.deliveries}
        isLoading={summaryQuery.isLoading}
        isPercentage={displayMode === "percentage"}
      />
      <MetricCard
        title={selectedChannel === ChannelType.Email ? "OPENS" : "DELIVERED"}
        value={
          selectedChannel === ChannelType.Email
            ? summary.opens
            : summary.deliveries - summary.bounces
        }
        isLoading={summaryQuery.isLoading}
        isPercentage={displayMode === "percentage"}
      />
      {selectedChannel === ChannelType.Email && (
        <MetricCard
          title="CLICKS"
          value={summary.clicks}
          isLoading={summaryQuery.isLoading}
          isPercentage={displayMode === "percentage"}
        />
      )}
      <MetricCard
        title={selectedChannel === ChannelType.Email ? "BOUNCES" : "FAILED"}
        value={summary.bounces}
        isLoading={summaryQuery.isLoading}
        isPercentage={displayMode === "percentage"}
      />
    </Stack>
  );
}
