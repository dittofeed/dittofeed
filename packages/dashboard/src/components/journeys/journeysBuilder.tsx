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

function buildNewSingleNodeConnection({
  source,
  target,
  newNodeId,
}: {
  source: string;
  target: string;
  newNodeId: string;
}): Edge<EdgeData>[] {
  return [
    {
      id: `${newNodeId}->${target}`,
      source: newNodeId,
      target,
      type: "workflow",
    },
    {
      id: `${source}->${newNodeId}`,
      source,
      target: newNodeId,
      type: "workflow",
    },
  ];
}

// this function adds a new node and connects it to the source node
function createConnections({
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
}) {
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
  let newEdges: Edge<EdgeData>[];

  const { nodeTypeProps } = newJourneyNode.data;
  switch (nodeTypeProps.type) {
    case JourneyNodeType.SegmentSplitNode: {
      const trueId = nodeTypeProps.trueLabelNodeId;
      const falseId = nodeTypeProps.falseLabelNodeId;
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
          sourceHandle: "bottom",
          target: newJourneyNode.id,
          type: "workflow",
        },
        {
          id: `${newJourneyNode.id}->${trueId}`,
          source: newJourneyNode.id,
          sourceHandle: "bottom",
          target: trueId,
          type: "placeholder",
        },
        {
          id: `${newJourneyNode.id}->${falseId}`,
          source: newJourneyNode.id,
          sourceHandle: "bottom",
          target: falseId,
          type: "placeholder",
        },
        {
          id: `${trueId}->${emptyId}`,
          source: trueId,
          target: emptyId,
          sourceHandle: "bottom",
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
          sourceHandle: "bottom",
          data: {
            type: "WorkflowEdge",
            disableMarker: true,
          },
          type: "workflow",
        },
        {
          id: `${emptyId}->${target}`,
          source: emptyId,
          sourceHandle: "bottom",
          target,
          type: "workflow",
        },
      ];
      break;
    }
    case JourneyNodeType.WaitForNode: {
      const segmentChild = nodeTypeProps.segmentChildren[0];
      if (!segmentChild) {
        throw new Error("Malformed journey, WaitForNode has no children.");
      }

      // [React Flow]: Couldn't create edge for source handle id: undefined; edge id: ef96afee-915e-45bc-99b3-4e64093d632e->a3e3209e-42e6-4e67-a77b-b588d6da34b6. Help: https://reactflow.dev/error#800
      // newJourneyNodeId->segmentChildLabelNodeId
      // warning also gets renderec for segment split, but still rendered
      const segmentChildLabelNodeId = segmentChild.labelNodeId;
      const { timeoutLabelNodeId } = nodeTypeProps;
      const emptyId = uuid();
      console.log("ids", {
        segmentChildLabelNodeId,
        timeoutLabelNodeId,
        newJourneyNodeId: newJourneyNode.id,
        emptyId,
        target,
        source,
      });

      newNodes = newNodes.concat([
        {
          id: segmentChildLabelNodeId,
          data: {
            type: "LabelNode",
            title: "true",
          },
          position: { x: 0, y: 0 },
          type: "label",
        },
        {
          id: timeoutLabelNodeId,
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
        // FIXME is this the issue?
        {
          id: `${newJourneyNode.id}->${segmentChildLabelNodeId}`,
          source: newJourneyNode.id,
          target: segmentChildLabelNodeId,
          type: "placeholder",
        },
        {
          id: `${newJourneyNode.id}->${timeoutLabelNodeId}`,
          source: newJourneyNode.id,
          target: timeoutLabelNodeId,
          type: "placeholder",
        },
        {
          id: `${segmentChildLabelNodeId}->${emptyId}`,
          source: segmentChildLabelNodeId,
          target: emptyId,
          data: {
            type: "WorkflowEdge",
            disableMarker: true,
          },
          type: "workflow",
        },
        {
          id: `${timeoutLabelNodeId}->${emptyId}`,
          source: timeoutLabelNodeId,
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

      break;
    }
    case JourneyNodeType.DelayNode: {
      newEdges = buildNewSingleNodeConnection({
        source,
        target,
        newNodeId: newJourneyNode.id,
      });
      break;
    }
    case JourneyNodeType.MessageNode: {
      newEdges = buildNewSingleNodeConnection({
        source,
        target,
        newNodeId: newJourneyNode.id,
      });
      break;
    }
    case JourneyNodeType.EntryNode: {
      throw new Error("Cannot add an entry node");
    }
    case JourneyNodeType.ExitNode: {
      throw new Error("Cannot add an exit node");
    }
  }

  for (const edge of newEdges) {
    if (edge.source === undefined) {
      debugger;
    }
    if (edge.target === undefined) {
      debugger;
    }
  }

  console.log("newEdges", newEdges);
  console.log("newNodes", newNodes);
  addNodes({ nodes: newNodes, edges: newEdges, source, target });
}

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
