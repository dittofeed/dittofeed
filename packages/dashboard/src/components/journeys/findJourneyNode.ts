import { Node } from "reactflow";

import { JourneyNodeProps, NodeData } from "../../lib/types";
import findNode from "./findNode";
import { isJourneyNode } from "./isJourneyNode";

export default function findJourneyNode(
  nodeId: string,
  nodes: Node<NodeData>[],
  nodesIndex: Record<string, number>
): Node<JourneyNodeProps> | null {
  const node = findNode(nodeId, nodes, nodesIndex);
  if (node && isJourneyNode(node)) {
    return node;
  }
  return null;
}
