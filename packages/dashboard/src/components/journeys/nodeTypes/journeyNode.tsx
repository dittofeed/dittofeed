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
  ClickAwayListener,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { format } from "date-fns";
import { round } from "isomorphic-lib/src/numbers";
import { isStringPresent } from "isomorphic-lib/src/strings";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  DelayVariantType,
  JourneyNodeType,
  NodeStatsType,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { useCallback, useMemo } from "react";

import { useAppStore, useAppStorePick } from "../../../lib/appStore";
import {
  AdditionalJourneyNodeType,
  AppState,
  JourneyUiNodeDefinition,
  JourneyUiNodeTypeProps,
} from "../../../lib/types";
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
  state: Pick<AppState, "segments" | "messages">,
): boolean {
  switch (props.type) {
    case AdditionalJourneyNodeType.EntryUiNode: {
      const { variant } = props;

      switch (variant.type) {
        case JourneyNodeType.SegmentEntryNode: {
          if (!variant.segment) {
            return false;
          }
          if (state.segments.type !== CompletionStatus.Successful) {
            return true;
          }
          const segment = state.segments.value.find(
            (s) => s.id === variant.segment,
          );
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
  const segments = useAppStore((state) => state.segments);
  const theme = useTheme();

  if (!segmentId || segments.type !== CompletionStatus.Successful) {
    return null;
  }
  const segment = segments.value.find((s) => s.id === segmentId);
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

export function JourneyNode({ id, data }: NodeProps<JourneyUiNodeDefinition>) {
  const path = useRouter();
  const theme = useTheme();
  const {
    segments,
    messages,
    journeySelectedNodeId: selectedNodeId,
    setSelectedNodeId,
    journeyStats,
  } = useAppStorePick([
    "segments",
    "messages",
    "journeySelectedNodeId",
    "journeyStats",
    "setSelectedNodeId",
  ]);

  const { id: journeyId } = path.query;
  const config = useMemo(
    () => journNodeTypeToConfig(data.nodeTypeProps),
    [data.nodeTypeProps],
  );
  const clickInsideHandler = useCallback(() => {
    setSelectedNodeId(id);
  }, [id, setSelectedNodeId]);

  const isSelected = selectedNodeId === id;

  const clickOutsideHandler = useCallback(
    (event: MouseEvent | TouchEvent) => {
      // Clicking on another node should not trigger the node editor to close.
      if (!isSelected) {
        return;
      }

      const insideRenderer = event
        .composedPath()
        .find(
          (el) =>
            el instanceof HTMLElement &&
            el.classList.contains("react-flow__renderer"),
        );

      if (!insideRenderer) {
        return;
      }
      setSelectedNodeId(null);
    },
    [isSelected, setSelectedNodeId],
  );
  const isComplete = useMemo(
    () => isNodeComplete(data.nodeTypeProps, { segments, messages }),
    [data.nodeTypeProps, messages, segments],
  );

  const channelStats = useMemo(() => {
    if (!journeyId || typeof journeyId !== "string") {
      return null;
    }
    const stats = journeyStats[journeyId]?.nodeStats[id];
    return isSelected &&
      stats?.type === NodeStatsType.MessageNodeStats &&
      stats.sendRate &&
      stats.channelStats
      ? { ...stats.channelStats, sendRate: stats.sendRate }
      : null;
  }, [id, isSelected, journeyId, journeyStats]);

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

  const contents = (
    <Stack
      id={`journey-node-${id}`}
      direction="column"
      justifyContent="top"
      sx={{
        position: "relative",
      }}
    >
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
        <Stack
          direction="column"
          spacing={1}
          sx={{ padding: 2, width: "100%" }}
        >
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
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          padding: channelStats ? 1 : 0,
          backgroundColor: "white",
          borderStyle: "solid",
          width: JOURNEY_NODE_WIDTH,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          borderColor,
          borderWidth: "0 2px 2px 2px",
          opacity: channelStats ? 1 : 0,
          visibility: channelStats ? "visible" : "hidden",
          transition:
            "height .2s ease, padding-top .2s ease, padding-bottom .2s ease, opacity .2s ease",
          height: channelStats ? undefined : 0,
        }}
      >
        {channelStats ? (
          <>
            <StatCategory label="Sent" rate={channelStats.sendRate} />
            <StatCategory
              label="Delivered"
              rate={
                "deliveryRate" in channelStats
                  ? channelStats.deliveryRate
                  : "N/A"
              }
            />
            <StatCategory
              label="Opened"
              rate={
                channelStats.type === ChannelType.Email
                  ? channelStats.openRate
                  : "N/A"
              }
            />
            <StatCategory
              label="Clicked"
              rate={
                channelStats.type === ChannelType.Email
                  ? channelStats.clickRate
                  : "N/A"
              }
            />
            <StatCategory
              label="Spam"
              rate={
                channelStats.type === ChannelType.Email
                  ? channelStats.spamRate
                  : "N/A"
              }
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
      {isSelected ? (
        <ClickAwayListener onClickAway={clickOutsideHandler}>
          {contents}
        </ClickAwayListener>
      ) : (
        contents
      )}
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
