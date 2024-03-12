import { Node } from "reactflow";

import {
  JourneyNodeUiProps,
  JourneyUiNodeLabelProps,
  JourneyUiNodeType,
} from "../../lib/types";

export function isLabelNode(
  node: Node<JourneyNodeUiProps>,
): node is Node<JourneyUiNodeLabelProps> {
  return (
    node.type === "label" &&
    node.data.type === JourneyUiNodeType.JourneyUiNodeLabelProps
  );
}
