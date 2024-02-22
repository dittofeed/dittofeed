import { JourneyNodeType } from "isomorphic-lib/src/types";
import { Node } from "reactflow";

import { AdditionalJourneyNodeType, NodeData } from "../../lib/types";

export enum GlobalJourneyErrorType {
  WaitForNodeAndEventEntryNode = "WaitForNodeAndEventEntryNode",
}

export interface GlobalJourneyError {
  message: string;
}

export function getGlobalJourneyErrors({
  nodes,
}: {
  nodes: Node<NodeData>[];
}): Map<GlobalJourneyErrorType, string> {
  let hasEventEntry = false;
  let hasWaitForNode = false;
  for (const node of nodes) {
    if (node.data.type === "JourneyNode") {
      const { nodeTypeProps } = node.data;
      if (
        nodeTypeProps.type === AdditionalJourneyNodeType.UiEntryNode &&
        nodeTypeProps.variant.type === JourneyNodeType.EventEntryNode
      ) {
        hasEventEntry = true;
      }
      if (nodeTypeProps.type === JourneyNodeType.WaitForNode) {
        hasWaitForNode = true;
      }
    }
  }
  const errors = new Map<GlobalJourneyErrorType, string>();
  if (hasEventEntry && hasWaitForNode) {
    errors.set(
      GlobalJourneyErrorType.WaitForNodeAndEventEntryNode,
      "A journey cannot have both an Event Entry node and a Wait For node",
    );
  }
  return errors;
}
