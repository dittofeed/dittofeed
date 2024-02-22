import "reactflow/dist/style.css";

import { Box, useTheme } from "@mui/material";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { CompletionStatus, JourneyNodeType } from "isomorphic-lib/src/types";
import React, { DragEvent, DragEventHandler } from "react";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  EdgeChange,
  MarkerType,
  Node,
  NodeChange,
  OnEdgesChange,
  OnNodesChange,
  Panel,
  ProOptions,
  ReactFlowProvider,
} from "reactflow";
import { v4 as uuid } from "uuid";

import { useAppStorePick } from "../../lib/appStore";
import {
  AdditionalJourneyNodeType,
  AppState,
  EdgeData,
  JourneyNodeProps,
  NodeData,
  NodeTypeProps,
} from "../../lib/types";
import { useJourneyStats } from "../../lib/useJourneyStats";
import edgeTypes from "./edgeTypes";
import NodeEditor from "./nodeEditor";
import nodeTypes from "./nodeTypes";
import defaultNodeTypeProps from "./nodeTypes/defaultNodeTypeProps";
import Sidebar from "./sidebar";
import {
  dualNodeNonJourneyNodes,
  edgesForJourneyNode,
  WAIT_FOR_SATISFY_LABEL,
  waitForTimeoutLabel,
} from "./store";

const proOptions: ProOptions = { account: "paid-pro", hideAttribution: true };

const handleDragOver: DragEventHandler<HTMLDivElement> = (e) => {
  e.preventDefault();
};

// this function adds a new node and connects it to the source node
function createConnections({
  nodes,
  nodeType,
  source,
  target,
  addNodes,
}: {
  nodeType: NodeTypeProps["type"];
  nodes: AppState["journeyNodes"];
  addNodes: AppState["addNodes"];
  source: string;
  target: string;
}) {
  // TODO create an incremental ID based on the number of elements already in the graph
  const newTargetId = uuid();

  const newJourneyNode: Node<JourneyNodeProps> = {
    id: newTargetId,
    data: {
      type: "JourneyNode",
      nodeTypeProps: defaultNodeTypeProps(nodeType, nodes),
    },
    position: { x: 0, y: 0 }, // no need to pass a position as it is computed by the layout hook
    type: "journey",
  };
  let newNodes: Node<NodeData>[] = [newJourneyNode];
  let newEdges: Edge<EdgeData>[];

  const { nodeTypeProps } = newJourneyNode.data;
  switch (nodeTypeProps.type) {
    case JourneyNodeType.SegmentSplitNode: {
      const trueId = nodeTypeProps.trueLabelNodeId;
      const falseId = nodeTypeProps.falseLabelNodeId;
      const emptyId = uuid();

      newNodes = newNodes.concat(
        dualNodeNonJourneyNodes({
          emptyId,
          leftId: trueId,
          rightId: falseId,
          leftLabel: "true",
          rightLabel: "false",
        }),
      );

      newEdges = edgesForJourneyNode({
        type: nodeTypeProps.type,
        nodeId: newTargetId,
        emptyId,
        leftId: trueId,
        rightId: falseId,
        source,
        target,
      });
      break;
    }
    case JourneyNodeType.WaitForNode: {
      const segmentChild = nodeTypeProps.segmentChildren[0];
      if (!segmentChild) {
        throw new Error("Malformed journey, WaitForNode has no children.");
      }

      const segmentChildLabelNodeId = segmentChild.labelNodeId;
      const { timeoutLabelNodeId } = nodeTypeProps;
      const emptyId = uuid();

      newNodes = newNodes.concat(
        dualNodeNonJourneyNodes({
          emptyId,
          leftId: segmentChildLabelNodeId,
          rightId: timeoutLabelNodeId,
          leftLabel: WAIT_FOR_SATISFY_LABEL,
          rightLabel: waitForTimeoutLabel(nodeTypeProps.timeoutSeconds),
        }),
      );

      newEdges = edgesForJourneyNode({
        type: nodeTypeProps.type,
        nodeId: newTargetId,
        emptyId,
        leftId: segmentChildLabelNodeId,
        rightId: timeoutLabelNodeId,
        source,
        target,
      });
      break;
    }
    case JourneyNodeType.DelayNode: {
      newEdges = edgesForJourneyNode({
        type: nodeTypeProps.type,
        nodeId: newTargetId,
        source,
        target,
      });
      break;
    }
    case JourneyNodeType.MessageNode: {
      newEdges = edgesForJourneyNode({
        type: nodeTypeProps.type,
        nodeId: newTargetId,
        source,
        target,
      });
      break;
    }
    case AdditionalJourneyNodeType.UiEntryNode: {
      throw new Error("Cannot add entry node in the UI implementation error.");
    }
    case JourneyNodeType.ExitNode: {
      throw new Error("Cannot add exit node in the UI implementation error.");
    }
    default:
      assertUnreachable(nodeTypeProps);
  }

  addNodes({ nodes: newNodes, edges: newEdges, source, target });
}

function JourneysBuilderInner({ journeyId }: { journeyId: string }) {
  const {
    setNodes,
    addNodes,
    setEdges,
    journeyNodes: nodes,
    journeyEdges: edges,
    journeyDraggedComponentType: draggedComponentType,
    apiBase,
    workspace,
    upsertJourneyStats,
    setJourneyStatsRequest,
  } = useAppStorePick([
    "apiBase",
    "setNodes",
    "addNodes",
    "setEdges",
    "journeyNodes",
    "journeyEdges",
    "journeyDraggedComponentType",
    "workspace",
    "setJourneyStatsRequest",
    "upsertJourneyStats",
  ]);

  useJourneyStats({
    journeyIds: [journeyId],
    workspaceId:
      workspace.type === CompletionStatus.Successful
        ? workspace.value.id
        : undefined,
    apiBase,
    setJourneyStatsRequest,
    upsertJourneyStats,
  });

  // this function is called once the node from the sidebar is dropped onto a node in the current graph
  const onDrop: DragEventHandler = (evt: DragEvent<HTMLDivElement>) => {
    // make sure that the event target is a DOM element
    if (evt.target instanceof SVGElement && draggedComponentType) {
      const { source, target } = evt.target.dataset;
      // from the target element search for the node wrapper element which has the node id as attribute

      if (source && target) {
        // now we can create a connection to the drop target node
        createConnections({
          nodeType: draggedComponentType,
          source,
          target,
          addNodes,
          nodes,
        });
      }
    }
  };

  const onNodesChange: OnNodesChange = (changes: NodeChange[]) => {
    setNodes(changes);
  };

  const onEdgesChange: OnEdgesChange = (changes: EdgeChange[]) => {
    setEdges(changes);
  };

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        margin: 0,
        padding: 0,
        display: "flex",
      }}
      onDragOver={handleDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onDrop={onDrop}
        proOptions={proOptions}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          style: {
            strokeWidth: 2,
          },
        }}
        nodeOrigin={[0.5, 0.5]}
        // TODO get fitview playing nice with nodeOrigin
        defaultViewport={{ x: 500, y: 0, zoom: 1 }}
        minZoom={0.2}
        panOnScroll
        deleteKeyCode={null}
        zoomOnPinch
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
      >
        <NodeEditor />
        <Panel position="top-left">
          <Sidebar />
        </Panel>
        <Controls position="top-right" />
        <Background
          color="#C7C7D4"
          style={{ backgroundColor: "#F7F8FA" }}
          size={2}
        />
      </ReactFlow>
    </Box>
  );
}

export default function JourneysBuilder({ journeyId }: { journeyId: string }) {
  return (
    <ReactFlowProvider>
      <JourneysBuilderInner journeyId={journeyId} />
    </ReactFlowProvider>
  );
}
