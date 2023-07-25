import * as dag from "d3-dag";
import dagre from "dagre";
import { useEffect } from "react";
import { Edge, Node, ReactFlowState, useReactFlow, useStore } from "reactflow";

import { NodeData } from "../../lib/types";
import { JOURNEY_NODE_WIDTH } from "./nodeTypes/styles";

export const nodeHeight = 200;

const opt = dag.decrossOpt();
const heuristic = dag.decrossTwoLayer();

function decrossFallback(layers: dag.SugiNode[][]): void {
  try {
    opt(layers);
  } catch {
    heuristic(layers);
  }
}

const dagLayout = dag
  .sugiyama()
  .layering(dag.layeringCoffmanGraham())
  .nodeSize(() => [400, nodeHeight])
  .decross(decrossFallback)
  .coord(dag.coordCenter());

// dagreGraph.setGraph({ rankdir: "TB", nodesep: 25 });

// the layouting function
// accepts current nodes and edges and returns the layouted nodes with their updated positions
export function layoutNodes(nodes: Node<NodeData>[], edges: Edge[]): Node[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Maintains consistent ordering of nodes so that the layout function can be applied consistently
  nodes.sort((n1, n2) => {
    if (n1.data.type === "LabelNode" && n2.data.type === "LabelNode") {
      return n1.data.title.localeCompare(n2.data.title);
    }

    return n1.data.type.localeCompare(n2.data.type);
  });

  dagreGraph.setGraph({ rankdir: "TB", nodesep: 0, ranksep: 0 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: JOURNEY_NODE_WIDTH,
      height: nodeHeight,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    node.position = {
      x: nodeWithPosition.x,
      y: nodeWithPosition.y,
    };

    return node;
  });

  return nodes;
}

// this is the store selector that is used for triggering the layout, this returns the number of nodes once they change
const nodeCountSelector = (state: ReactFlowState) => state.nodeInternals.size;

function useLayout() {
  const { getNodes, setNodes, getEdges } = useReactFlow();

  const nodeCount = useStore(nodeCountSelector);

  useEffect(() => {
    // get the current nodes and edges
    const nodes = getNodes();
    const edges = getEdges();

    // run the layout and get back the nodes with their updated positions
    const targetNodes = layoutNodes(nodes, edges);

    // if you do not want to animate the nodes, you can uncomment the following line
    return setNodes(targetNodes);
  }, [nodeCount, getEdges, getNodes, setNodes]);
}

export default useLayout;
