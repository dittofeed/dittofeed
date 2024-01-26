import { Node } from "reactflow";

import { JourneyNodeProps, NodeData } from "../../lib/types";

export function isJourneyNode(
  node: Node<NodeData>,
): node is Node<JourneyNodeProps> {
  return node.type === "journey" && node.data.type === "JourneyNode";
}
