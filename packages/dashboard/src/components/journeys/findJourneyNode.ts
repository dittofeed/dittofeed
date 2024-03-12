import { Node } from "reactflow";

import {
  JourneyNodeUiProps,
  JourneyUiNodeDefinitionProps,
} from "../../lib/types";
import findNode from "./findNode";
import { isJourneyNode } from "./isJourneyNode";

export default function findJourneyNode(
  nodeId: string,
  nodes: Node<JourneyNodeUiProps>[],
  nodesIndex: Record<string, number>,
): Node<JourneyUiNodeDefinitionProps> | null {
  const node = findNode(nodeId, nodes, nodesIndex);
  if (node && isJourneyNode(node)) {
    return node;
  }
  return null;
}
