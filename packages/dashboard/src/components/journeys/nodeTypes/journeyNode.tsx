import {
  AccessTimeOutlined,
  BackHandOutlined,
  BoltOutlined,
  CallSplitOutlined,
  ExitToAppOutlined,
  MailOutlineOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  CardContent,
  ClickAwayListener,
  FormControl,
  FormControlLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Switch,
  Typography,
  useTheme,
} from "@mui/material";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { format, subMinutes } from "date-fns";

import { DateRangeSelector, DateRangeValue, TimeOptionId } from "../../dateRangeSelector";
import { round } from "isomorphic-lib/src/numbers";
import { isStringPresent } from "isomorphic-lib/src/strings";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  DelayVariantType,
  JourneyNodeType,
  MessageTemplateResource,
  NodeStatsType,
  SavedSegmentResource,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";

import { useAppStorePick } from "../../../lib/appStore";
import {
  AdditionalJourneyNodeType,
  JourneyUiNodeDefinition,
  JourneyUiNodeTypeProps,
} from "../../../lib/types";
import { useJourneyStatsQueryV2 } from "../../../lib/useJourneyStatsQueryV2";
import { useMessageTemplatesQuery } from "../../../lib/useMessageTemplatesQuery";
import { useSegmentsQuery } from "../../../lib/useSegmentsQuery";
import DurationDescription from "../../durationDescription";
import journeyNodeLabel from "../journeyNodeLabel";
import styles from "./nodeTypes.module.css";
import { JOURNEY_NODE_WIDTH } from "./styles";

export type JourneyNodeIcon = typeof MailOutlineOutlined;

interface JourneyNodeConfig {
  sidebarColor: string;
  icon: JourneyNodeIcon;
  title: string;
  body?: React.ReactElement | null;
  disableTopHandle?: boolean;
  disableBottomHandle?: boolean;
}

/**
 * Validates that journey node can be saved.
 * @param props
 * @param state
 * @returns
 */
export function isNodeComplete(
  props: JourneyUiNodeTypeProps,
  state: {
    segments: SavedSegmentResource[];
    messages: MessageTemplateResource[];
  },
): boolean {
  switch (props.type) {
    case AdditionalJourneyNodeType.EntryUiNode: {
      const { variant } = props;

      switch (variant.type) {
        case JourneyNodeType.SegmentEntryNode: {
          if (!variant.segment) {
            return false;
          }
          const segment = state.segments.find((s) => s.id === variant.segment);
          return segment !== undefined;
        }
        case JourneyNodeType.EventEntryNode: {
          return isStringPresent(variant.event);
        }
        default:
          assertUnreachable(variant);
      }
      break;
    }
    case JourneyNodeType.ExitNode:
      return true;
    case JourneyNodeType.MessageNode:
      return Boolean(props.templateId);
    case JourneyNodeType.DelayNode:
      switch (props.variant.type) {
        case DelayVariantType.Second: {
          return Boolean(props.variant.seconds);
        }
        case DelayVariantType.LocalTime: {
          return (
            props.variant.minute !== undefined &&
            props.variant.hour !== undefined
          );
        }
        case DelayVariantType.UserProperty: {
          return Boolean(props.variant.userProperty);
        }
        default:
          assertUnreachable(props.variant);
      }
      break;
    case JourneyNodeType.SegmentSplitNode:
      return Boolean(props.segmentId);
    case JourneyNodeType.WaitForNode: {
      const segmentChild = props.segmentChildren[0];
      return segmentChild !== undefined && Boolean(segmentChild.segmentId);
    }
  }
}

function SegmentDescriptionBody({
  segmentId,
  prefix = "User in",
}: {
  segmentId?: string;
  prefix?: string;
}) {
  const { data: segmentsResult } = useSegmentsQuery({
    resourceType: "Declarative",
  });

  const theme = useTheme();

  if (!segmentId || !segmentsResult) {
    return null;
  }
  const segment = segmentsResult.segments.find((s) => s.id === segmentId);
  if (!segment) {
    return null;
  }
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box>{prefix}</Box>
      <Typography
        sx={{
          padding: 1,
          borderRadius: 1,
          backgroundColor: theme.palette.grey[200],
        }}
      >
        {segment.name}
      </Typography>
    </Stack>
  );
}

function EventTriggerDescriptionBody({ event }: { event?: string }) {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box>Triggered by Track Event</Box>
      <Typography
        sx={{
          padding: 1,
          borderRadius: 1,
          fontFamily: "monospace",
          backgroundColor: theme.palette.grey[200],
        }}
      >
        {event}
      </Typography>
    </Stack>
  );
}

export function journeyNodeIcon(
  type: JourneyUiNodeTypeProps["type"],
): JourneyNodeIcon {
  switch (type) {
    case AdditionalJourneyNodeType.EntryUiNode:
      return BoltOutlined;
    case JourneyNodeType.DelayNode:
      return AccessTimeOutlined;
    case JourneyNodeType.SegmentSplitNode:
      return CallSplitOutlined;
    case JourneyNodeType.MessageNode:
      return MailOutlineOutlined;
    case JourneyNodeType.ExitNode:
      return ExitToAppOutlined;
    case JourneyNodeType.WaitForNode:
      return BackHandOutlined;
  }
}

function journNodeTypeToConfig(
  props: JourneyUiNodeTypeProps,
): JourneyNodeConfig {
  const t = props.type;
  switch (t) {
    case AdditionalJourneyNodeType.EntryUiNode: {
      const body =
        props.variant.type === JourneyNodeType.SegmentEntryNode ? (
          <SegmentDescriptionBody segmentId={props.variant.segment} />
        ) : (
          <EventTriggerDescriptionBody event={props.variant.event} />
        );
      return {
        sidebarColor: "transparent",
        icon: journeyNodeIcon(t),
        title: journeyNodeLabel(t),
        disableTopHandle: true,
        body,
      };
    }
    case JourneyNodeType.DelayNode: {
      let body: React.ReactElement;
      switch (props.variant.type) {
        case DelayVariantType.Second: {
          body = (
            <DurationDescription durationSeconds={props.variant.seconds} />
          );
          break;
        }
        case DelayVariantType.LocalTime: {
          const { hour, minute } = props.variant;
          // year, month, and day are arbitrary
          const time = format(new Date(2000, 0, 1, hour, minute), "h:mm a");
          body = <>Delay until {time} in user local time.</>;
          break;
        }
        case DelayVariantType.UserProperty: {
          body = <>Delay until date resolved by user property.</>;
          break;
        }
        default:
          assertUnreachable(props.variant);
      }

      return {
        sidebarColor: "#F77520",
        icon: journeyNodeIcon(JourneyNodeType.DelayNode),
        title: journeyNodeLabel(JourneyNodeType.DelayNode),
        body,
      };
      break;
    }
    case JourneyNodeType.SegmentSplitNode: {
      const body = <SegmentDescriptionBody segmentId={props.segmentId} />;
      return {
        sidebarColor: "#12F7BE",
        icon: journeyNodeIcon(JourneyNodeType.SegmentSplitNode),
        title: props.name,
        body,
      };
    }
    case JourneyNodeType.MessageNode:
      return {
        sidebarColor: "#03D9F5",
        icon: journeyNodeIcon(JourneyNodeType.MessageNode),
        title: props.name.length ? props.name : "Unfinished Message",
        body: null,
      };
    case JourneyNodeType.ExitNode:
      return {
        sidebarColor: "transparent",
        disableBottomHandle: true,
        icon: journeyNodeIcon(JourneyNodeType.ExitNode),
        title: journeyNodeLabel(JourneyNodeType.ExitNode),
        body: null,
      };
    case JourneyNodeType.WaitForNode: {
      const segmentChild = props.segmentChildren[0];
      if (!segmentChild) {
        throw new Error("Segment child is undefined");
      }
      const body = (
        <SegmentDescriptionBody
          segmentId={segmentChild.segmentId}
          prefix="Waits for user to enter"
        />
      );
      return {
        sidebarColor: "#F7741E",
        icon: journeyNodeIcon(JourneyNodeType.WaitForNode),
        title: journeyNodeLabel(JourneyNodeType.WaitForNode),
        body,
      };
    }
  }
}

const borderRadius = 2;



function StatCategory({
  label,
  rate,
}: {
  label: string;
  rate: number | string;
}) {
  return (
    <Stack direction="column">
      <Typography variant="subtitle2">{label}</Typography>
      <Box
        sx={{
          fontFamily: "monospace",
        }}
      >
        {typeof rate === "number" ? `${round(rate * 100, 2)}%` : rate}
      </Box>
    </Stack>
  );
}

interface SmallMetricCardProps {
  title: string;
  value: number;
  isLoading?: boolean;
  isPercentage?: boolean;
}

function SmallMetricCard({
  title,
  value,
  isLoading = false,
  isPercentage = false,
}: SmallMetricCardProps) {
  return (
    <Card sx={{ minWidth: 60, textAlign: "center", flex: 1 }}>
      <CardContent sx={{ p: 0.25, "&:last-child": { pb: 0.25 } }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: "0.6rem" }}
        >
          {title}
        </Typography>
        {isLoading ? (
          <Skeleton variant="text" width={30} height={16} sx={{ mx: "auto" }} />
        ) : (
          <Typography
            variant="caption"
            component="div"
            sx={{ fontWeight: "bold", fontSize: "0.7rem" }}
          >
            {isPercentage ? `${value.toFixed(1)}%` : value.toLocaleString()}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export function JourneyNode({ id, data }: NodeProps<JourneyUiNodeDefinition>) {
  const path = useRouter();
  const theme = useTheme();
  const {
    journeySelectedNodeId: selectedNodeId,
    setSelectedNodeId,
    journeyStats,
  } = useAppStorePick([
    "journeySelectedNodeId",
    "journeyStats",
    "setSelectedNodeId",
  ]);
  const { data: segmentsResult } = useSegmentsQuery({
    resourceType: "Declarative",
  });
  const { data: messagesResult } = useMessageTemplatesQuery({
    resourceType: "Declarative",
  });

  // State for date range and display mode using DateRangeSelector
  const [dateRangeValue, setDateRangeValue] = useState<DateRangeValue>(() => {
    const endDate = new Date();
    const startDate = subMinutes(endDate, 7 * 24 * 60); // Last 7 days
    return {
      startDate,
      endDate,
      selectedTimeOption: TimeOptionId.LastSevenDays,
    };
  });
  const [displayMode, setDisplayMode] = useState<"absolute" | "percentage">(
    "percentage",
  );

  const { id: journeyId } = path.query;
  const config = useMemo(
    () => journNodeTypeToConfig(data.nodeTypeProps),
    [data.nodeTypeProps],
  );
  const clickInsideHandler = useCallback(() => {
    setSelectedNodeId(id);
  }, [id, setSelectedNodeId]);

  const isSelected = selectedNodeId === id;

  // New journey stats query
  const { data: journeyStatsData, isLoading: isStatsLoading } =
    useJourneyStatsQueryV2(
      {
        journeyId: typeof journeyId === "string" ? journeyId : "",
        startDate: dateRangeValue.startDate.toISOString(),
        endDate: dateRangeValue.endDate.toISOString(),
      },
      {
        enabled: typeof journeyId === "string" && isSelected,
      },
    );

  const clickOutsideHandler = useCallback(
    (event: MouseEvent | TouchEvent) => {
      // Clicking on another node should not trigger the node editor to close.
      if (!isSelected) {
        return;
      }

      const insideExempted = event
        .composedPath()
        .some(
          (el) =>
            el instanceof HTMLElement &&
            (!el.classList.contains("react-flow__renderer") ||
              el.classList.contains("journey-node-footer")),
        );

      if (insideExempted) {
        console.log("insideExempted");
        return;
      }
      console.log("outsideExempted");
      setSelectedNodeId(null);
    },
    [isSelected, setSelectedNodeId],
  );
  const isComplete = useMemo(
    () =>
      isNodeComplete(data.nodeTypeProps, {
        segments: segmentsResult?.segments ?? [],
        messages: messagesResult ?? [],
      }),
    [data.nodeTypeProps, messagesResult, segmentsResult],
  );

  // Process the new journey stats data
  const nodeStats = useMemo(() => {
    if (!isSelected || !journeyStatsData?.nodeStats) {
      return null;
    }
    const rawStats = journeyStatsData.nodeStats[id];
    if (!rawStats) {
      return null;
    }

    const sent = rawStats.sent || 0;
    const delivered = rawStats.delivered || 0;
    const opened = rawStats.opened || 0;
    const clicked = rawStats.clicked || 0;
    const bounced = rawStats.bounced || 0;

    if (displayMode === "percentage" && sent > 0) {
      return {
        sent,
        delivered: (delivered / sent) * 100,
        opened: (opened / sent) * 100,
        clicked: (clicked / sent) * 100,
        bounced: (bounced / sent) * 100,
      };
    }

    return {
      sent,
      delivered,
      opened,
      clicked,
      bounced,
    };
  }, [id, isSelected, journeyStatsData, displayMode]);

  const borderColor: string = isSelected
    ? theme.palette.blue[200]
    : theme.palette.grey[200];

  const body = !isComplete ? (
    <Stack direction="row">
      <Box
        sx={{
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: theme.palette.warning.postIt,
          color: theme.palette.warning.postItContrastText,
          borderRadius: 1,
        }}
      >
        You still have work to do
      </Box>
      <Box sx={{ flex: 1 }} />
    </Stack>
  ) : (
    config.body
  );

  const mainContent = (
    <Box
      onClick={clickInsideHandler}
      sx={{
        width: JOURNEY_NODE_WIDTH,
        display: "flex",
        flexDirection: "row",
        backgroundColor: "white",
        justifyItems: "stretch",
        cursor: "pointer",
        borderStyle: "solid",
        borderRadius,
        borderColor,
        borderWidth: 2,
      }}
    >
      <Box
        sx={{
          backgroundColor: config.sidebarColor,
          width: 5,
          borderTopLeftRadius: borderRadius,
          borderBottomLeftRadius: borderRadius,
          borderWidth: "1px 0 1px 1px",
          borderColor,
        }}
      />
      <Stack direction="column" spacing={1} sx={{ padding: 2, width: "100%" }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <config.icon />
          <Typography
            variant="h5"
            sx={{
              height: "1.5rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {config.title}
          </Typography>
        </Stack>
        {body}
      </Stack>
    </Box>
  );

  const clickAwayMain = isSelected ? (
    <ClickAwayListener onClickAway={clickOutsideHandler}>
      {mainContent}
    </ClickAwayListener>
  ) : (
    mainContent
  );

  const contents = (
    <Stack
      id={`journey-node-${id}`}
      direction="column"
      justifyContent="top"
      sx={{
        position: "relative",
      }}
    >
      {clickAwayMain}
      <Stack
        className="journey-node-footer"
        direction="column"
        sx={{
          padding: nodeStats ? 1 : 0,
          backgroundColor: "white",
          borderStyle: "solid",
          width: JOURNEY_NODE_WIDTH,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          borderColor,
          borderWidth: "0 2px 2px 2px",
          opacity: nodeStats ? 1 : 0,
          visibility: nodeStats ? "visible" : "hidden",
          transition:
            "height .2s ease, padding-top .2s ease, padding-bottom .2s ease, opacity .2s ease",
          height: nodeStats ? undefined : 0,
        }}
      >
        {nodeStats ? (
          <>
            {/* Metric Cards Row */}
            <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
              <SmallMetricCard
                title="SENT"
                value={nodeStats.sent}
                isLoading={isStatsLoading}
                isPercentage={false}
              />
              <SmallMetricCard
                title="DELIVERED"
                value={nodeStats.delivered}
                isLoading={isStatsLoading}
                isPercentage={displayMode === "percentage"}
              />
              <SmallMetricCard
                title="OPENED"
                value={nodeStats.opened}
                isLoading={isStatsLoading}
                isPercentage={displayMode === "percentage"}
              />
              <SmallMetricCard
                title="CLICKED"
                value={nodeStats.clicked}
                isLoading={isStatsLoading}
                isPercentage={displayMode === "percentage"}
              />
            </Stack>

            {/* Date Range Selector */}
            <Box sx={{ mb: 0.5 }}>
              <DateRangeSelector
                value={dateRangeValue}
                onChange={setDateRangeValue}
              />
            </Box>

            {/* Display Mode Toggle */}
            <FormControlLabel
              control={
                <Switch
                  checked={displayMode === "percentage"}
                  onChange={(e) =>
                    setDisplayMode(e.target.checked ? "percentage" : "absolute")
                  }
                  size="small"
                />
              }
              label={
                <Typography sx={{ fontSize: "0.7rem" }}>
                  {displayMode === "percentage" ? "%" : "#"}
                </Typography>
              }
              sx={{ m: 0, justifyContent: "space-between", width: "100%" }}
            />
          </>
        ) : null}
      </Stack>
    </Stack>
  );

  return (
    <>
      {!config.disableTopHandle && (
        <Handle
          type="target"
          position={Position.Top}
          id="top"
          className={styles.handle}
        />
      )}
      {contents}
      {!config.disableBottomHandle && (
        <Handle
          type="source"
          id="bottom"
          position={Position.Bottom}
          className={styles.handle}
        />
      )}
    </>
  );
}
