import {
  ClockCircleOutlined,
  DeliveredProcedureOutlined,
  type FontSizeOutlined,
  ForkOutlined,
  MailOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import BackHandOutlined from "@mui/icons-material/BackHandOutlined";
import {
  Box,
  ClickAwayListener,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { format } from "date-fns";
import { round } from "isomorphic-lib/src/numbers";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  CompletionStatus,
  DelayVariantType,
  JourneyNodeType,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { Handle, NodeProps, Position } from "reactflow";

import { useAppStore, useAppStorePick } from "../../../lib/appStore";
import { AppState, JourneyNodeProps, NodeTypeProps } from "../../../lib/types";
import DurationDescription from "../../durationDescription";
import journeyNodeLabel from "../journeyNodeLabel";
import styles from "./nodeTypes.module.css";
import { JOURNEY_NODE_WIDTH } from "./styles";

export type JourneyNodeIcon = typeof FontSizeOutlined | typeof BackHandOutlined;

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
  props: NodeTypeProps,
  state: Pick<AppState, "segments" | "messages">,
): boolean {
  switch (props.type) {
    case JourneyNodeType.EntryNode: {
      if (!props.segmentId) {
        return false;
      }
      if (state.segments.type !== CompletionStatus.Successful) {
        return true;
      }
      const segment = state.segments.value.find(
        (s) => s.id === props.segmentId,
      );
      return segment !== undefined;
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

export function journeyNodeIcon(type: JourneyNodeType): JourneyNodeIcon {
  switch (type) {
    case JourneyNodeType.EntryNode:
      return ThunderboltOutlined;
    case JourneyNodeType.DelayNode:
      return ClockCircleOutlined;
    case JourneyNodeType.SegmentSplitNode:
      return ForkOutlined;
    case JourneyNodeType.MessageNode:
      return MailOutlined;
    case JourneyNodeType.ExitNode:
      return DeliveredProcedureOutlined;
    case JourneyNodeType.WaitForNode:
      return BackHandOutlined;
    case JourneyNodeType.ExperimentSplitNode:
      throw new Error("Not implemented");
    case JourneyNodeType.RateLimitNode:
      throw new Error("Not implemented");
  }
}

function journNodeTypeToConfig(props: NodeTypeProps): JourneyNodeConfig {
  const t = props.type;
  switch (t) {
    case JourneyNodeType.EntryNode: {
      const body = <SegmentDescriptionBody segmentId={props.segmentId} />;
      return {
        sidebarColor: "transparent",
        icon: journeyNodeIcon(JourneyNodeType.EntryNode),
        title: journeyNodeLabel(JourneyNodeType.EntryNode),
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
        title: props.name,
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

function StatCategory({ label, rate }: { label: string; rate: number }) {
  return (
    <Stack direction="column">
      <Typography variant="subtitle2">{label}</Typography>
      <Box
        sx={{
          fontFamily: "monospace",
        }}
      >
        {round(rate * 100, 2)}%
      </Box>
    </Stack>
  );
}

export function JourneyNode({ id, data }: NodeProps<JourneyNodeProps>) {
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
  if (!journeyId || typeof journeyId !== "string") {
    return null;
  }

  const config = journNodeTypeToConfig(data.nodeTypeProps);
  const isSelected = selectedNodeId === id;

  const clickInsideHandler = () => {
    setSelectedNodeId(id);
  };

  const clickOutsideHandler = (event: MouseEvent | TouchEvent) => {
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
  };

  const borderColor: string = isSelected
    ? theme.palette.blue[200]
    : theme.palette.grey[200];

  const body = !isNodeComplete(data.nodeTypeProps, { segments, messages }) ? (
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

  const stats = isSelected && journeyStats[journeyId]?.nodeStats[id];

  const contents = (
    <Stack
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
          padding: stats ? 1 : 0,
          backgroundColor: "white",
          borderStyle: "solid",
          width: JOURNEY_NODE_WIDTH,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          borderColor,
          borderWidth: "0 2px 2px 2px",
          opacity: stats ? 1 : 0,
          visibility: stats ? "visible" : "hidden",
          transition:
            "height .2s ease, padding-top .2s ease, padding-bottom .2s ease, opacity .2s ease",
          height: stats ? undefined : 0,
        }}
      >
        {stats ? (
          <>
            <StatCategory label="Sent" rate={stats.sendRate} />
            <StatCategory
              label="Delivered"
              rate={stats.channelStats.deliveryRate}
            />
            <StatCategory label="Opened" rate={stats.channelStats.openRate} />
            <StatCategory label="Clicked" rate={stats.channelStats.clickRate} />
            <StatCategory label="Spam" rate={stats.channelStats.spamRate} />
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
      <ClickAwayListener onClickAway={clickOutsideHandler}>
        {contents}
      </ClickAwayListener>
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
