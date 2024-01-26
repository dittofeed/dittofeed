import { Node } from "reactflow";

import { LabelNodeProps, NodeData } from "../../lib/types";

export function isLabelNode(
  node: Node<NodeData>,
): node is Node<LabelNodeProps> {
  return node.type === "label" && node.data.type === "LabelNode";
}
