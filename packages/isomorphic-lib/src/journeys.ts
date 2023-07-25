import {
  JourneyBodyNode,
  JourneyDefinition,
  JourneyNode,
  JourneyNodeType,
} from "./types";

function nodeToSegments(node: JourneyBodyNode): string[] {
  switch (node.type) {
    case JourneyNodeType.SegmentSplitNode: {
      return [node.variant.segment];
    }
    case JourneyNodeType.ExperimentSplitNode:
      return [];
    case JourneyNodeType.RateLimitNode:
      return [];
    case JourneyNodeType.MessageNode:
      return [];
    case JourneyNodeType.DelayNode:
      return [];
    case JourneyNodeType.WaitForNode:
      return node.segmentChildren.map((c) => c.segmentId);
  }
}

/**
 * Returns the set of segments that this journey depends on.
 * @param definition
 * @returns
 */
export function getSubscribedSegments(
  definition: JourneyDefinition
): Set<string> {
  const subscribedSegments = new Set<string>();
  subscribedSegments.add(definition.entryNode.segment);
  for (const node of definition.nodes) {
    const segments = nodeToSegments(node);
    for (const segment of segments) {
      subscribedSegments.add(segment);
    }
  }
  return subscribedSegments;
}

export function getJourneyNode(
  definition: JourneyDefinition,
  nodeId: string
): JourneyNode | null {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (nodeId === JourneyNodeType.EntryNode) {
    return definition.entryNode;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (nodeId === JourneyNodeType.ExitNode) {
    return definition.exitNode;
  }
  const node = definition.nodes.find((n) => n.id === nodeId) ?? null;
  return node;
}

export function getDirectChildren(
  nodeId: string,
  definition: JourneyDefinition
): Set<string> {
  const node = getJourneyNode(definition, nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} not found in journey`);
  }
  let children: Set<string>;
  switch (node.type) {
    case JourneyNodeType.SegmentSplitNode: {
      const { trueChild, falseChild } = node.variant;
      children = new Set<string>([trueChild, falseChild]);
      break;
    }
    case JourneyNodeType.WaitForNode: {
      children = new Set<string>([
        node.timeoutChild,
        ...node.segmentChildren.map((c) => c.id),
      ]);
      break;
    }
    case JourneyNodeType.MessageNode:
      children = new Set<string>([node.child]);
      break;
    case JourneyNodeType.EntryNode:
      children = new Set<string>([node.child]);
      break;
    case JourneyNodeType.DelayNode:
      children = new Set<string>([node.child]);
      break;
    case JourneyNodeType.ExitNode:
      children = new Set<string>();
      break;
    case JourneyNodeType.ExperimentSplitNode:
      throw new Error("Not implemented");
    case JourneyNodeType.RateLimitNode:
      throw new Error("Not implemented");
  }

  return children;
}

export function getDirectParents(
  nodeId: string,
  definition: JourneyDefinition
): Set<string> {
  const parents = new Set<string>();

  // Iterate over all nodes in the journey definition
  for (const node of definition.nodes) {
    // Get the direct children of the current node
    const children = getDirectChildren(node.id, definition);

    // Check if the specified node is a child of the current node
    if (children.has(nodeId)) {
      // If it is, add the current node to the set of direct parents
      parents.add(node.id);
    }
  }

  return parents;
}
