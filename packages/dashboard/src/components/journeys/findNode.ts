import { Node } from "@xyflow/react";

import { JourneyNodeUiProps } from "../../lib/types";

export default function findNode(
  nodeId: string,
  nodes: Node<JourneyNodeUiProps>[],
  nodesIndex: Record<string, number>,
): Node<JourneyNodeUiProps> | null {
  const nodeIndex = nodesIndex[nodeId];
  const node = nodeIndex !== undefined ? nodes[nodeIndex] : null;
  if (node) {
    return node;
  }
  return null;
}
