import { Node } from "reactflow";

import { NodeData } from "../../lib/types";

export default function findNode(
  nodeId: string,
  nodes: Node<NodeData>[],
  nodesIndex: Record<string, number>
): Node<NodeData> | null {
  const nodeIndex = nodesIndex[nodeId];
  const node = nodeIndex !== undefined ? nodes[nodeIndex] : null;
  if (node) {
    return node;
  }
  return null;
}
