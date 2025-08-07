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
import { AnalysisFiltersState } from "./analysisChartFilters";

interface AnalysisSummaryPanelProps {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  filtersState: AnalysisFiltersState;
  onChannelSelect: (channel: ChannelType) => void;
  displayMode: "absolute" | "percentage";
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
}: AnalysisSummaryPanelProps) {
  // Check if channel filter is already applied
  const hasChannelFilter = filtersState.filters.has("channels");
  const selectedChannel = hasChannelFilter
    ? (Array.from(
        filtersState.filters.get("channels")?.value.keys() || [],
      )[0] as ChannelType)
    : undefined;

  // Build filters object from filter state
  const filters = useMemo(() => {
    const journeyFilter = filtersState.filters.get("journeys");
    const journeyIds = journeyFilter
      ? Array.from(journeyFilter.value.keys())
      : undefined;

    const broadcastFilter = filtersState.filters.get("broadcasts");
    const broadcastIds = broadcastFilter
      ? Array.from(broadcastFilter.value.keys())
      : undefined;

    const channelFilter = filtersState.filters.get("channels");
    const channels = channelFilter
      ? Array.from(channelFilter.value.keys())
      : undefined;

    const providerFilter = filtersState.filters.get("providers");
    const providers = providerFilter
      ? Array.from(providerFilter.value.keys())
      : undefined;

    const messageStateFilter = filtersState.filters.get("messageStates");
    const messageStates = messageStateFilter
      ? Array.from(messageStateFilter.value.keys())
      : undefined;

    const templateFilter = filtersState.filters.get("templates");
    const templateIds = templateFilter
      ? Array.from(templateFilter.value.keys())
      : undefined;

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
