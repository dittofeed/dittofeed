import { Node } from "reactflow";

import {
  JourneyNodeUiDefinitionProps,
  JourneyNodeUiProps,
} from "../../lib/types";

export function isJourneyNode(
  node: Node<JourneyNodeUiProps>,
): node is Node<JourneyNodeUiDefinitionProps> {
  return node.type === "journey" && node.data.type === "JourneyNode";
}
