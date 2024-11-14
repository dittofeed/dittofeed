import { Node } from "@xyflow/react";
import {
  JourneyNodeType,
  PartialSegmentResource,
  SegmentNodeType,
} from "isomorphic-lib/src/types";

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
  segments,
}: {
  segments: PartialSegmentResource[];
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
        const notKeyedSegment = segments.find(
          (s) =>
            nodeTypeProps.segmentChildren.some(
              (child) => child.segmentId === s.id,
            ) &&
            s.definition?.entryNode.type !== SegmentNodeType.KeyedPerformed,
        );
        if (notKeyedSegment) {
          hasWaitForNode = true;
        }
      }
    }
  }
  const errors = new Map<GlobalJourneyErrorType, string>();
  if (hasEventEntry && hasWaitForNode) {
    errors.set(
      GlobalJourneyErrorType.WaitForNodeAndEventEntryNode,
      "A journey cannot have both an Event Entry node and a non-keyed Wait For node",
    );
  }
  return errors;
}
