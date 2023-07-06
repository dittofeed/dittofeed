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
import { CompletionStatus, JourneyNodeType } from "isomorphic-lib/src/types";
import { Handle, NodeProps, Position } from "reactflow";

import { useAppStore } from "../../../lib/appStore";
import { AppState, JourneyNodeProps, NodeTypeProps } from "../../../lib/types";
import DurationDescription from "../../durationDescription";
import journeyNodeLabel from "../journeyNodeLabel";
import styles from "./nodeTypes.module.css";

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
  state: Pick<AppState, "segments" | "messages">
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
        (s) => s.id === props.segmentId
      );
      return segment !== undefined;
    }
    case JourneyNodeType.ExitNode:
      return true;
    case JourneyNodeType.MessageNode:
      return Boolean(props.templateId);
    case JourneyNodeType.DelayNode:
      return Boolean(props.seconds);
    case JourneyNodeType.SegmentSplitNode:
      return Boolean(props.segmentId);
    case JourneyNodeType.WaitForNode: {
      const segmentChild = props.segmentChildren[0];
      return segmentChild !== undefined && Boolean(segmentChild.segmentId);
    }
  }
}

function SegmentDescriptionBody({ segmentId }: { segmentId?: string }) {
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
      <Box>User in</Box>
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
    case JourneyNodeType.DelayNode:
      return {
        sidebarColor: "#F77520",
        icon: journeyNodeIcon(JourneyNodeType.DelayNode),
        title: journeyNodeLabel(JourneyNodeType.DelayNode),
        body: <DurationDescription durationSeconds={props.seconds} />,
      };
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
      return {
        sidebarColor: "#F7741E",
        disableBottomHandle: true,
        icon: journeyNodeIcon(JourneyNodeType.WaitForNode),
        title: journeyNodeLabel(JourneyNodeType.WaitForNode),
        body: null,
      };
    }
  }
}

const borderRadius = 2;

export function JourneyNode({ id, data }: NodeProps<JourneyNodeProps>) {
  const theme = useTheme();
  const segments = useAppStore((store) => store.segments);
  const messages = useAppStore((store) => store.messages);
  const config = journNodeTypeToConfig(data.nodeTypeProps);
  const setSelectedNodeId = useAppStore((state) => state.setSelectedNodeId);
  const selectedNodeId = useAppStore((state) => state.journeySelectedNodeId);
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
          el.classList.contains("react-flow__renderer")
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

  const contents = (
    <Box
      onClick={clickInsideHandler}
      sx={{
        width: 300,
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
