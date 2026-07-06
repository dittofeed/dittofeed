import "@xyflow/react/dist/style.css";

import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import {
  AdditionalJourneyNodeType,
  JourneyNodeType,
} from "isomorphic-lib/src/types";
import { useEffect, useMemo, useState } from "react";

import { JourneyUiNodeDefinition, JourneyUiNodeLabel } from "../../lib/types";
import { useJourneyQuery } from "../../lib/useJourneyQuery";
import journeyNodeLabel from "../journeys/journeyNodeLabel";
import { layoutNodes } from "../journeys/layoutNodes";
import { journeyNodeIcon } from "../journeys/nodeTypes/journeyNode";
import styles from "../journeys/nodeTypes/nodeTypes.module.css";
import { JOURNEY_NODE_WIDTH } from "../journeys/nodeTypes/styles";
import { journeyToState } from "../journeys/store";

function JourneyPickerJourneyNode({
  id,
  data,
  selected,
}: NodeProps<JourneyUiNodeDefinition>) {
  const theme = useTheme();
  const Icon = journeyNodeIcon(data.nodeTypeProps.type);
  const title = journeyNodeLabel(data.nodeTypeProps.type);
  const disableTopHandle =
    data.nodeTypeProps.type === AdditionalJourneyNodeType.EntryUiNode;
  const disableBottomHandle =
    data.nodeTypeProps.type === JourneyNodeType.ExitNode;
  const borderColor = selected
    ? theme.palette.primary.main
    : theme.palette.grey[300];

  return (
    <>
      {!disableTopHandle ? (
        <Handle
          type="target"
          position={Position.Top}
          className={styles.handle}
          id="top"
        />
      ) : null}
      <Box
        sx={{
          width: JOURNEY_NODE_WIDTH,
          display: "flex",
          flexDirection: "row",
          backgroundColor: "white",
          borderStyle: "solid",
          borderRadius: 1,
          borderColor,
          borderWidth: selected ? 2 : 1,
          cursor: "pointer",
          boxShadow: selected ? 2 : 1,
        }}
      >
        <Box
          sx={{
            backgroundColor: selected
              ? theme.palette.primary.light
              : theme.palette.grey[200],
            width: 5,
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
          }}
        />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2 }}>
          <Icon fontSize="small" />
          <Stack spacing={0.25}>
            <Typography variant="subtitle1">{title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {id}
            </Typography>
          </Stack>
        </Stack>
      </Box>
      {!disableBottomHandle ? (
        <Handle
          type="source"
          id="bottom"
          position={Position.Bottom}
          className={styles.handle}
        />
      ) : null}
    </>
  );
}

function JourneyPickerLabelNode({ data }: NodeProps<JourneyUiNodeLabel>) {
  const theme = useTheme();
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className={styles.handle}
        id="top"
      />
      <Box
        sx={{ p: 1, backgroundColor: theme.palette.grey[200], borderRadius: 1 }}
      >
        {data.title}
      </Box>
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className={styles.handle}
      />
    </>
  );
}

function JourneyPickerEmptyNode() {
  const theme = useTheme();
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className={styles.handle}
        id="top"
      />
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: theme.palette.grey[400],
        }}
      />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className={styles.handle}
      />
    </>
  );
}

const pickerNodeTypes = {
  journey: JourneyPickerJourneyNode,
  label: JourneyPickerLabelNode,
  empty: JourneyPickerEmptyNode,
};

function FitViewOnLoad({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (nodeCount > 0) {
      fitView({ padding: 0.2 });
    }
  }, [nodeCount, fitView]);

  return null;
}

function JourneyNodePickerGraph({
  journeyId,
  selectedNodeId,
  onSelectNodeId,
}: {
  journeyId: string;
  selectedNodeId: string;
  onSelectNodeId: (nodeId: string) => void;
}) {
  const { data: journey, isPending, isError } = useJourneyQuery(journeyId);

  const { nodes, edges } = useMemo(() => {
    if (!journey?.definition) {
      return { nodes: [], edges: [] };
    }

    const state = journeyToState({
      name: journey.name,
      definition: journey.definition,
    });

    const nodesWithSelection = state.journeyNodes.map((node) => ({
      ...node,
      selected: node.id === selectedNodeId,
      selectable: node.type === "journey",
    }));

    const layoutedNodes = layoutNodes(nodesWithSelection, state.journeyEdges);
    const layoutedEdges = state.journeyEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep" as const,
      style: { strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
    }));

    return {
      nodes: layoutedNodes,
      edges: layoutedEdges,
    };
  }, [journey, selectedNodeId]);

  if (isPending) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={{ width: "100%", height: "100%" }}
      >
        <CircularProgress />
      </Stack>
    );
  }

  if (isError || !journey?.definition) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={{ width: "100%", height: "100%" }}
      >
        <Typography color="text.secondary">
          Unable to load journey graph.
        </Typography>
      </Stack>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={pickerNodeTypes}
      onNodeClick={(_event, node) => {
        if (node.type === "journey") {
          onSelectNodeId(node.id);
        }
      }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnScroll
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
    >
      <FitViewOnLoad nodeCount={nodes.length} />
      <Controls position="top-right" />
      <Background color="#C7C7D4" style={{ backgroundColor: "#F7F8FA" }} />
    </ReactFlow>
  );
}

export function JourneyNodePickerModal({
  open,
  onClose,
  journeyId,
  selectedNodeId,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  journeyId: string;
  selectedNodeId: string;
  onConfirm: (nodeId: string) => void;
}) {
  const [pendingNodeId, setPendingNodeId] = useState(selectedNodeId);

  useEffect(() => {
    if (open) {
      setPendingNodeId(selectedNodeId);
    }
  }, [open, selectedNodeId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Select Journey Node</DialogTitle>
      <DialogContent dividers sx={{ height: 560, p: 0 }}>
        {!journeyId ? (
          <Stack
            alignItems="center"
            justifyContent="center"
            sx={{ width: "100%", height: "100%" }}
          >
            <Typography color="text.secondary">
              Select a journey first.
            </Typography>
          </Stack>
        ) : (
          <ReactFlowProvider>
            <Box sx={{ width: "100%", height: "100%" }}>
              <JourneyNodePickerGraph
                journeyId={journeyId}
                selectedNodeId={pendingNodeId}
                onSelectNodeId={setPendingNodeId}
              />
            </Box>
          </ReactFlowProvider>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!pendingNodeId}
          onClick={() => onConfirm(pendingNodeId)}
        >
          Select
        </Button>
      </DialogActions>
    </Dialog>
  );
}
