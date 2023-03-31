import { Delete } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import {
  CompletionStatus,
  JourneyNodeType,
  MessageTemplateResource,
  SegmentResource,
} from "isomorphic-lib/src/types";
import { ReactNode, useMemo } from "react";
import { Node } from "reactflow";

import { useAppStore } from "../../lib/appStore";
import {
  DelayNodeProps,
  EntryNodeProps,
  JourneyNodeProps,
  MessageNodeProps,
  SegmentSplitNodeProps,
} from "../../lib/types";
import DurationDescription from "../durationDescription";
import findJourneyNode from "./findJourneyNode";

const width = 420;
const transitionDuration = ".15s";

function nodeTypeLabel(t: JourneyNodeType): string {
  switch (t) {
    case JourneyNodeType.EntryNode:
      return "Entry";
    case JourneyNodeType.SegmentSplitNode:
      return "Segment Split";
    case JourneyNodeType.MessageNode:
      return "Message";
    case JourneyNodeType.ExitNode:
      return "Exit";
    case JourneyNodeType.DelayNode:
      return "Delay";
    default:
      throw new Error(`Unimplemented journey node type ${t}`);
  }
}

function getSegmentLabel(tr: SegmentResource) {
  return tr.name;
}

function SegmentSplitNodeFields({
  nodeId,
  nodeProps,
}: {
  nodeId: string;
  nodeProps: SegmentSplitNodeProps;
}) {
  const updateJourneyNodeData = useAppStore(
    (state) => state.updateJourneyNodeData
  );

  const segments = useAppStore((state) => state.segments);

  const onSegmentChangeHandler = (
    _event: unknown,
    segment: SegmentResource | null
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.SegmentSplitNode) {
        props.segmentId = segment?.id;
      }
    });
  };

  if (segments.type !== CompletionStatus.Successful) {
    return null;
  }

  const segment =
    segments.value.find((t) => t.id === nodeProps.segmentId) ?? null;

  return (
    <Autocomplete
      value={segment}
      options={segments.value}
      getOptionLabel={getSegmentLabel}
      onChange={onSegmentChangeHandler}
      renderInput={(params) => (
        <TextField {...params} label="segment" variant="outlined" />
      )}
    />
  );
}

function EntryNodeFields({
  nodeId,
  nodeProps,
}: {
  nodeId: string;
  nodeProps: EntryNodeProps;
}) {
  const updateJourneyNodeData = useAppStore(
    (state) => state.updateJourneyNodeData
  );

  const segments = useAppStore((state) => state.segments);

  const onSegmentChangeHandler = (
    _event: unknown,
    segment: SegmentResource | null
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.EntryNode) {
        props.segmentId = segment?.id;
      }
    });
  };

  if (segments.type !== CompletionStatus.Successful) {
    return null;
  }

  const segment =
    segments.value.find((t) => t.id === nodeProps.segmentId) ?? null;

  return (
    <Autocomplete
      value={segment}
      options={segments.value}
      getOptionLabel={getSegmentLabel}
      onChange={onSegmentChangeHandler}
      renderInput={(params) => (
        <TextField {...params} label="segment" variant="outlined" />
      )}
    />
  );
}

function getTemplateLabel(tr: MessageTemplateResource) {
  return tr.name;
}

function MessageNodeFields({
  nodeId,
  nodeProps,
}: {
  nodeId: string;
  nodeProps: MessageNodeProps;
}) {
  const updateJourneyNodeData = useAppStore(
    (state) => state.updateJourneyNodeData
  );
  const templates = useAppStore((state) => state.messages);

  const onNameChangeHandler: React.ChangeEventHandler<
    HTMLTextAreaElement | HTMLInputElement
  > = (e) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.MessageNode) {
        props.name = e.target.value;
      }
    });
  };

  const onTemplateChangeHandler = (
    _event: unknown,
    template: MessageTemplateResource | null
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.MessageNode) {
        props.templateId = template?.id;
      }
    });
  };

  if (templates.type !== CompletionStatus.Successful) {
    return null;
  }

  const template =
    templates.value.find((t) => t.id === nodeProps.templateId) ?? null;

  return (
    <>
      <TextField
        label="name"
        value={nodeProps.name}
        onChange={onNameChangeHandler}
      />
      <Autocomplete
        value={template}
        options={templates.value}
        getOptionLabel={getTemplateLabel}
        onChange={onTemplateChangeHandler}
        renderInput={(params) => (
          <TextField {...params} label="template" variant="outlined" />
        )}
      />
    </>
  );
}

function DelayNodeFields({
  nodeId,
  nodeProps,
}: {
  nodeId: string;
  nodeProps: DelayNodeProps;
}) {
  const updateJourneyNodeData = useAppStore(
    (state) => state.updateJourneyNodeData
  );

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.DelayNode) {
        props.seconds = parseInt(e.target.value, 10);
      }
    });
  };

  return (
    <>
      <TextField
        label="Duration (Seconds)"
        InputProps={{
          type: "number",
        }}
        value={String(nodeProps.seconds)}
        onChange={handleDurationChange}
      />

      <Box>
        Will wait <DurationDescription durationSeconds={nodeProps.seconds} />
      </Box>
    </>
  );
}

function NodeLayout({
  deleteButton,
  children,
}: {
  deleteButton?: boolean;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Stack
      sx={{ height: "100%" }}
      justifyContent="space-between"
      direction="column"
    >
      <Stack
        spacing={2}
        sx={{
          paddingLeft: 2,
          paddingRight: 2,
          paddingTop: 2,
        }}
      >
        {children}
      </Stack>
      <Stack
        flexDirection="row"
        justifyContent="right"
        alignItems="center"
        sx={{
          height: theme.spacing(8),
          paddingRight: 2,
          backgroundColor: theme.palette.grey[200],
        }}
      >
        {deleteButton ? (
          <Button variant="contained" color="error" startIcon={<Delete />}>
            Delete Journey Node
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}

function NodeFields({ node }: { node: Node<JourneyNodeProps> }) {
  const nodeProps = node.data.nodeTypeProps;

  switch (nodeProps.type) {
    case JourneyNodeType.EntryNode:
      return (
        <NodeLayout>
          <EntryNodeFields nodeId={node.id} nodeProps={nodeProps} />
        </NodeLayout>
      );
    case JourneyNodeType.SegmentSplitNode:
      return (
        <NodeLayout deleteButton>
          <SegmentSplitNodeFields nodeId={node.id} nodeProps={nodeProps} />
        </NodeLayout>
      );
    case JourneyNodeType.MessageNode: {
      return (
        <NodeLayout deleteButton>
          <MessageNodeFields nodeId={node.id} nodeProps={nodeProps} />
        </NodeLayout>
      );
    }
    case JourneyNodeType.ExitNode:
      return <NodeLayout />;
    case JourneyNodeType.DelayNode:
      return (
        <NodeLayout deleteButton>
          <DelayNodeFields nodeId={node.id} nodeProps={nodeProps} />
        </NodeLayout>
      );
  }
}

function NodeEditorContents({ node }: { node: Node<JourneyNodeProps> }) {
  return (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
      }}
    >
      <Typography
        variant="h5"
        sx={{
          padding: 2,
        }}
      >
        Edit {nodeTypeLabel(node.data.nodeTypeProps.type)}
      </Typography>
      <NodeFields node={node} />
    </Stack>
  );
}

export const journeyNodeEditorId = "journey-node-editor";

export default function NodeEditor() {
  const theme = useTheme();
  const selectedNodeId = useAppStore((state) => state.journeySelectedNodeId);
  const nodes = useAppStore((state) => state.journeyNodes);
  const nodesIndex = useAppStore((state) => state.journeyNodesIndex);
  const selectedNode = useMemo(
    () =>
      selectedNodeId
        ? findJourneyNode(selectedNodeId, nodes, nodesIndex)
        : null,
    [selectedNodeId, nodes, nodesIndex]
  );
  const isOpen = !!selectedNode;

  return (
    <Box
      id={journeyNodeEditorId}
      sx={{
        width,
        left: isOpen ? 0 : -width,
        opacity: isOpen ? 1 : 0,
        visibility: isOpen ? "visible" : "hidden",
        height: "100%",
        transition: `opacity ${transitionDuration} ease,visibility ${transitionDuration},left ${transitionDuration} cubic-bezier(0.820, 0.085, 0.395, 0.895)`,
        border: `1px solid ${theme.palette.grey[200]}`,
        boxShadow: "0 4px 20px rgb(47 50 106 / 15%)",
        position: "relative",
        zIndex: 20,
        backgroundColor: "white",
      }}
    >
      <>{selectedNode ? <NodeEditorContents node={selectedNode} /> : null}</>
    </Box>
  );
}
