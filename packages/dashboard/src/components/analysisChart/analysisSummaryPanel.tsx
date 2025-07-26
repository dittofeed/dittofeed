import { Email, Sms } from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
  Skeleton,
} from "@mui/material";
import { ChannelType } from "isomorphic-lib/src/types";
import React, { useMemo } from "react";

import { useAnalysisSummaryQuery } from "../../lib/useAnalysisSummaryQuery";
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
    <Card sx={{ minWidth: 120, textAlign: "center" }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {title}
        </Typography>
        {isLoading ? (
          <Skeleton variant="text" width={60} height={32} sx={{ mx: "auto" }} />
        ) : (
          <Typography variant="h6" component="div">
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
    ? Array.from(filtersState.filters.get("channels")?.value.keys() || [])[0] as ChannelType
    : undefined;

  // Build filters object from filter state
  const filters = useMemo(() => {
    const journeyIds = filtersState.filters.get("journeys")
      ? Array.from(filtersState.filters.get("journeys")!.value.keys())
      : undefined;
    const broadcastIds = filtersState.filters.get("broadcasts")
      ? Array.from(filtersState.filters.get("broadcasts")!.value.keys())
      : undefined;
    const channels = filtersState.filters.get("channels")
      ? Array.from(filtersState.filters.get("channels")!.value.keys())
      : undefined;
    const providers = filtersState.filters.get("providers")
      ? Array.from(filtersState.filters.get("providers")!.value.keys())
      : undefined;
    const messageStates = filtersState.filters.get("messageStates")
      ? Array.from(filtersState.filters.get("messageStates")!.value.keys())
      : undefined;
    const templateIds = filtersState.filters.get("templates")
      ? Array.from(filtersState.filters.get("templates")!.value.keys())
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

  const summary = summaryQuery.data?.summary || {
    deliveries: 0,
    opens: 0,
    clicks: 0,
    bounces: 0,
  };

  if (!hasChannelFilter) {
    // Show basic deliveries count with channel selection buttons
    return (
      <Box sx={{ py: 3 }}>
        <Stack spacing={3} alignItems="center">
          <Stack direction="row" spacing={2} alignItems="center">
            <MetricCard
              title="DELIVERIES"
              value={summary.deliveries}
              isLoading={summaryQuery.isLoading}
            />
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Select a channel to see a detailed summary.
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Email />}
                  onClick={() => onChannelSelect(ChannelType.Email)}
                  sx={{ textTransform: "none" }}
                >
                  Email
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Sms />}
                  onClick={() => onChannelSelect(ChannelType.Sms)}
                  sx={{ textTransform: "none" }}
                >
                  SMS
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Stack>
      </Box>
    );
  }

  // Show detailed summary for selected channel
  return (
    <Box sx={{ py: 3 }}>
      <Stack direction="row" spacing={2} justifyContent="center">
        <MetricCard
          title="DELIVERIES"
          value={summary.deliveries}
          isLoading={summaryQuery.isLoading}
        />
        <MetricCard
          title={selectedChannel === ChannelType.Email ? "OPENS" : "DELIVERED"}
          value={selectedChannel === ChannelType.Email ? summary.opens : summary.deliveries - summary.bounces}
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