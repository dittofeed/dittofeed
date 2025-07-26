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
}

interface MetricCardProps {
  title: string;
  value: number;
  isLoading?: boolean;
}

function MetricCard({ title, value, isLoading = false }: MetricCardProps) {
  return (
    <Card sx={{ minWidth: 80, textAlign: "center" }}>
      <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          {title}
        </Typography>
        {isLoading ? (
          <Skeleton variant="text" width={40} height={24} sx={{ mx: "auto" }} />
        ) : (
          <Typography variant="subtitle1" component="div">
            {value.toLocaleString()}
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

  const summaryQuery = useAnalysisSummaryQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    displayMode: "absolute",
    channel: selectedChannel,
    ...(filters && { filters }),
  });

  const summary: SummaryMetric = summaryQuery.data?.summary || {
    sent: 0,
    deliveries: 0,
    opens: 0,
    clicks: 0,
    bounces: 0,
  };

  console.log({ summary, summaryQueryData: summaryQuery.data });

  if (!hasChannelFilter) {
    // Show basic sent messages count with channel selection buttons
    return (
      <Box sx={{ py: 2 }}>
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          justifyContent="center"
        >
          <MetricCard
            title="SENT"
            value={summary.sent}
            isLoading={summaryQuery.isLoading}
          />
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Select a channel to see a detailed summary.
            </Typography>
            <Stack direction="row" spacing={1}>
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
    <Box sx={{ py: 2 }}>
      <Stack direction="row" spacing={2} justifyContent="center">
        <MetricCard
          title="SENT"
          value={summary.sent}
          isLoading={summaryQuery.isLoading}
        />
        <MetricCard
          title="DELIVERIES"
          value={summary.deliveries}
          isLoading={summaryQuery.isLoading}
        />
        <MetricCard
          title={selectedChannel === ChannelType.Email ? "OPENS" : "DELIVERED"}
          value={
            selectedChannel === ChannelType.Email
              ? summary.opens
              : summary.deliveries - summary.bounces
          }
          isLoading={summaryQuery.isLoading}
        />
        {selectedChannel === ChannelType.Email && (
          <MetricCard
            title="CLICKS"
            value={summary.clicks}
            isLoading={summaryQuery.isLoading}
          />
        )}
        <MetricCard
          title={selectedChannel === ChannelType.Email ? "BOUNCES" : "FAILED"}
          value={summary.bounces}
          isLoading={summaryQuery.isLoading}
        />
      </Stack>
    </Box>
  );
}
