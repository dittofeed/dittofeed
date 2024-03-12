import { JourneyNodeType } from "isomorphic-lib/src/types";
import { Node } from "reactflow";

import {
  AdditionalJourneyNodeType,
  JourneyNodeUiProps,
  JourneyUiNodeType,
} from "../../lib/types";

export enum GlobalJourneyErrorType {
  WaitForNodeAndEventEntryNode = "WaitForNodeAndEventEntryNode",
}
export function getGlobalJourneyErrors({
  nodes,
}: {
  nodes: Node<JourneyNodeUiProps>[];
}): Map<GlobalJourneyErrorType, string> {
  let hasEventEntry = false;
  let hasWaitForNode = false;
  for (const node of nodes) {
    if (node.data.type === JourneyUiNodeType.JourneyUiNodeDefinitionProps) {
      const { nodeTypeProps } = node.data;
      if (
        nodeTypeProps.type === AdditionalJourneyNodeType.EntryUiNode &&
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
