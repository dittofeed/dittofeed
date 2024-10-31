import { Node } from "@xyflow/react";

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
