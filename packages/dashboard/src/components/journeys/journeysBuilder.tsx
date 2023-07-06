import "reactflow/dist/style.css";

import { Box } from "@mui/material";
import { JourneyNodeType } from "isomorphic-lib/src/types";
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

import { useAppStore } from "../../lib/appStore";
import {
  AppState,
  EdgeData,
  JourneyNodeProps,
  NodeData,
} from "../../lib/types";
import edgeTypes from "./edgeTypes";
import NodeEditor from "./nodeEditor";
import nodeTypes from "./nodeTypes";
import defaultNodeTypeProps from "./nodeTypes/defaultNodeTypeProps";
import Sidebar from "./sidebar";

const proOptions: ProOptions = { account: "paid-pro", hideAttribution: true };

const handleDragOver: DragEventHandler<HTMLDivElement> = (e) => {
  e.preventDefault();
};

// this function adds a new node and connects it to the source node
const createConnections = ({
  nodes,
  nodeType,
  source,
  target,
  addNodes,
}: {
  nodeType: JourneyNodeType;
  nodes: AppState["journeyNodes"];
  addNodes: AppState["addNodes"];
  source: string;
  target: string;
}) => {
  // create an incremental ID based on the number of elements already in the graph
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

  let newEdges: Edge<EdgeData>[] = [];

  if (
    newJourneyNode.data.nodeTypeProps.type === JourneyNodeType.SegmentSplitNode
  ) {
    const trueId = newJourneyNode.data.nodeTypeProps.trueLabelNodeId;
    const falseId = newJourneyNode.data.nodeTypeProps.falseLabelNodeId;
    const emptyId = uuid();

    newNodes = newNodes.concat([
      {
        id: trueId,
        data: {
          type: "LabelNode",
          title: "true",
        },
        position: { x: 0, y: 0 },
        type: "label",
      },
      {
        id: falseId,
        data: {
          type: "LabelNode",
          title: "false",
        },
        position: { x: 0, y: 0 },
        type: "label",
      },
      {
        id: emptyId,
        data: {
          type: "EmptyNode",
        },
        position: { x: 0, y: 0 },
        type: "empty",
      },
    ]);

    newEdges = [
      {
        id: `${source}->${newJourneyNode.id}`,
        source,
        target: newJourneyNode.id,
        type: "workflow",
      },
      {
        id: `${newJourneyNode.id}->${trueId}`,
        source: newJourneyNode.id,
        target: trueId,
        type: "placeholder",
      },
      {
        id: `${newJourneyNode.id}->${falseId}`,
        source: newJourneyNode.id,
        target: falseId,
        type: "placeholder",
      },
      {
        id: `${trueId}->${emptyId}`,
        source: trueId,
        target: emptyId,
        data: {
          type: "WorkflowEdge",
          disableMarker: true,
        },
        type: "workflow",
      },
      {
        id: `${falseId}->${emptyId}`,
        source: falseId,
        target: emptyId,
        data: {
          type: "WorkflowEdge",
          disableMarker: true,
        },
        type: "workflow",
      },
      {
        id: `${emptyId}->${target}`,
        source: emptyId,
        target,
        type: "workflow",
      },
    ];
  } else {
    newEdges = [
      {
        id: `${newJourneyNode.id}->${target}`,
        source: newJourneyNode.id,
        target,
        type: "workflow",
      },
      {
        id: `${source}->${newJourneyNode.id}`,
        source,
        target: newJourneyNode.id,
        type: "workflow",
      },
    ];
  }
  addNodes({ nodes: newNodes, edges: newEdges, source, target });
};

function JourneysBuilderInner() {
  const setNodes = useAppStore((store) => store.setNodes);
  const addNodes = useAppStore((store) => store.addNodes);
  const setEdges = useAppStore((store) => store.setEdges);
  const nodes = useAppStore((store) => store.journeyNodes);
  const edges = useAppStore((store) => store.journeyEdges);
  const draggedComponentType = useAppStore(
    (store) => store.journeyDraggedComponentType
  );

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

export default function JourneysBuilder() {
  return (
    <ReactFlowProvider>
      <JourneysBuilderInner />
    </ReactFlowProvider>
  );
}
