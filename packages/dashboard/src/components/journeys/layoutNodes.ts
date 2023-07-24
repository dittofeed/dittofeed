import * as dag from "d3-dag";
import { useEffect } from "react";
import { Edge, Node, ReactFlowState, useReactFlow, useStore } from "reactflow";

import { NodeData } from "../../lib/types";

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

// the layouting function
// accepts current nodes and edges and returns the layouted nodes with their updated positions
export function layoutNodes(nodes: Node<NodeData>[], edges: Edge[]): Node[] {
  // Maintains consistent ordering of nodes so that the layout function can be applied consistently
  nodes.sort((n1, n2) => {
    if (n1.data.type === "LabelNode" && n2.data.type === "LabelNode") {
      return n1.data.title.localeCompare(n2.data.title);
    }

    return n1.data.type.localeCompare(n2.data.type);
  });

  const dagCreation = dag
    .dagStratify()
    .id((d: Node) => d.id)
    .parentIds((d: Node) => {
      const parentIds: string[] = edges
        .filter((e: Edge) => e.target === d.id)
        .map((e) => e.source);
      return parentIds;
    });

  const d3Dag = dagCreation(nodes);
  // TODO move into background with webworker
  try {
    dagLayout(d3Dag);
  } catch (e) {
    console.error("failed to layout journey", e);
  }

  const positionedNodes: Node[] = [];
  for (const d of Array.from(d3Dag)) {
    if (!d.x || !d.y) {
      continue;
    }

    positionedNodes.push({
      ...d.data,
      position: { x: d.x, y: d.y },
    });
  }

  return positionedNodes;
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
