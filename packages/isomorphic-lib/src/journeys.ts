import { JourneyBodyNode, JourneyDefinition, JourneyNodeType } from "./types";

function nodeToSegment(node: JourneyBodyNode): string | null {
  switch (node.type) {
    case JourneyNodeType.SegmentSplitNode: {
      return node.variant.segment;
    }
    case JourneyNodeType.ExperimentSplitNode:
      return null;
    case JourneyNodeType.RateLimitNode:
      return null;
    case JourneyNodeType.MessageNode:
      return null;
    case JourneyNodeType.DelayNode:
      return null;
  }
}

export function getSubscribedSegments(
  definition: JourneyDefinition
): Set<string> {
  const subscribedSegments = new Set<string>();
  subscribedSegments.add(definition.entryNode.segment);
  for (const node of definition.nodes) {
    const segment = nodeToSegment(node);
    if (segment) {
      subscribedSegments.add(segment);
    }
  }
  return subscribedSegments;
}
