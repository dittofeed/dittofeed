import { Node } from "@xyflow/react";

import {
  DefinitionJourneyNode,
  JourneyNodeUiProps,
  JourneyUiNodeType,
} from "../../lib/types";

export function isJourneyNode(
  node: Node<JourneyNodeUiProps>,
): node is DefinitionJourneyNode {
  return (
    node.type === "journey" &&
    node.data.type === JourneyUiNodeType.JourneyUiNodeDefinitionProps
  );
}
