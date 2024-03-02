import { Node } from "reactflow";

import {
  JourneyNodeUiDefinitionProps,
  JourneyNodeUiProps,
} from "../../lib/types";
import findNode from "./findNode";
import { isJourneyNode } from "./isJourneyNode";

export default function findJourneyNode(
  nodeId: string,
  nodes: Node<JourneyNodeUiProps>[],
  nodesIndex: Record<string, number>,
): Node<JourneyNodeUiDefinitionProps> | null {
  const node = findNode(nodeId, nodes, nodesIndex);
  if (node && isJourneyNode(node)) {
    return node;
  }
  return null;
}
