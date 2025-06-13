import "@xyflow/react/dist/style.css";

import { Box } from "@mui/material";
import {
  Background,
  Controls,
  EdgeChange,
  MarkerType,
  NodeChange,
  OnEdgesChange,
  OnNodesChange,
  Panel,
  ProOptions,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import {
  JourneyUiBodyNodeTypeProps,
  SavedSubscriptionGroupResource,
} from "isomorphic-lib/src/types";
import React, { DragEvent, DragEventHandler } from "react";
import { v4 as uuid } from "uuid";

import { useAppStorePick } from "../../lib/appStore";
import { AppState, JourneyUiEdge, JourneyUiNode } from "../../lib/types";
import { useJourneyStats } from "../../lib/useJourneyStats";
import { useSubscriptionGroupsQuery } from "../../lib/useSubscriptionGroupsQuery";
import edgeTypes from "./edgeTypes";
import NodeEditor from "./nodeEditor";
import nodeTypes from "./nodeTypes";
import { defaultBodyNodeTypeProps } from "./nodeTypes/defaultNodeTypeProps";
import Sidebar from "./sidebar";
import { createConnections } from "./store";

export const proOptions: ProOptions = {
  account: "paid-pro",
  hideAttribution: true,
};

export const handleDragOver: DragEventHandler<HTMLDivElement> = (e) => {
  e.preventDefault();
};

// this function adds a new node and connects it to the source node
export function createNewConnections({
  nodes,
  nodeType,
  source,
  target,
  addNodes,
  subscriptionGroups,
  setSelectedNodeId,
}: {
  nodeType: JourneyUiBodyNodeTypeProps["type"];
  nodes: AppState["journeyNodes"];
  addNodes: AppState["addNodes"];
  source: string;
  target: string;
  subscriptionGroups: SavedSubscriptionGroupResource[];
  setSelectedNodeId: AppState["setSelectedNodeId"];
}) {
  // TODO create an incremental ID based on the number of elements already in the graph
  const newTargetId = uuid();

  const { newNodes, newEdges } = createConnections({
    id: newTargetId,
    source,
    target,
    ...defaultBodyNodeTypeProps({ type: nodeType, nodes, subscriptionGroups }),
  });

  addNodes({ nodes: newNodes, edges: newEdges, source, target });
  setSelectedNodeId(newTargetId);
}

function JourneysBuilderInner({ journeyId }: { journeyId: string }) {
  const {
    setNodes,
    addNodes,
    setEdges,
    journeyNodes: nodes,
    journeyEdges: edges,
    journeyDraggedComponentType: draggedComponentType,
    upsertJourneyStats,
    setJourneyStatsRequest,
    viewDraft,
    setSelectedNodeId,
  } = useAppStorePick([
    "setNodes",
    "addNodes",
    "setEdges",
    "journeyNodes",
    "journeyEdges",
    "journeyDraggedComponentType",
    "setJourneyStatsRequest",
    "upsertJourneyStats",
    "viewDraft",
    "setSelectedNodeId",
  ]);
  const { data: subscriptionGroups } = useSubscriptionGroupsQuery();

  useJourneyStats({
    journeyIds: [journeyId],
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
        createNewConnections({
          nodeType: draggedComponentType,
          source,
          target,
          addNodes,
          nodes,
          subscriptionGroups: subscriptionGroups ?? [],
          setSelectedNodeId,
        });
      }
    }
  };

  const onNodesChange: OnNodesChange<JourneyUiNode> = (
    changes: NodeChange<JourneyUiNode>[],
  ) => {
    setNodes(changes);
  };

  const onEdgesChange: OnEdgesChange<JourneyUiEdge> = (
    changes: EdgeChange<JourneyUiEdge>[],
  ) => {
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
        <NodeEditor disabled={!viewDraft} />
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
