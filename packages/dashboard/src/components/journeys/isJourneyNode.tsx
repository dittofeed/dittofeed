import { Node } from "@xyflow/react";

import {
  JourneyNodeUiProps,
  JourneyUiNodeDefinitionProps,
  JourneyUiNodeType,
} from "../../lib/types";

export function isJourneyNode(
  node: Node<JourneyNodeUiProps>,
): node is Node<JourneyUiNodeDefinitionProps> {
  return (
    node.type === "journey" &&
    node.data.type === JourneyUiNodeType.JourneyUiNodeDefinitionProps
  );
}
