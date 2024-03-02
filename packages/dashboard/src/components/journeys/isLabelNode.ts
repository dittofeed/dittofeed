import { Node } from "reactflow";

import { JourneyNodeUiLabelProps, JourneyNodeUiProps } from "../../lib/types";

export function isLabelNode(
  node: Node<JourneyNodeUiProps>,
): node is Node<JourneyNodeUiLabelProps> {
  return node.type === "label" && node.data.type === "LabelNode";
}
