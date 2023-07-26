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

export function findDirectChildren(
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

export function findDirectParents(
  nodeId: string,
  definition: JourneyDefinition
): Set<string> {
  const parents = new Set<string>();

  // Iterate over all nodes in the journey definition
  for (const node of [definition.entryNode, ...definition.nodes]) {
    const id =
      node.type === JourneyNodeType.EntryNode
        ? JourneyNodeType.EntryNode
        : node.id;
    // Get the direct children of the current node
    const children = findDirectChildren(id, definition);

    // Check if the specified node is a child of the current node
    if (children.has(nodeId)) {
      // If it is, add the current node to the set of direct parents
      parents.add(id);
    }
  }

  return parents;
}

export function getNodeId(node: JourneyNode): string {
  if (node.type === JourneyNodeType.EntryNode) {
    return JourneyNodeType.EntryNode;
  }
  if (node.type === JourneyNodeType.ExitNode) {
    return JourneyNodeType.ExitNode;
  }
  return node.id;
}

export type HeritageMap = Record<
  // id of node for which heritage entry applies
  string,
  {
    // ids of direct children nodes
    children: Set<string>;
    // ids of all N nested children of node
    descendents: Set<string>;
    // ids of direct parents of the node
    parents: Set<string>;
    // ids of all N nested parents of node
    ancestors: Set<string>;
  }
>;

export function buildHeritageMap(definition: JourneyDefinition): HeritageMap {
  const map: HeritageMap = {};
  const nodes: JourneyNode[] = [
    definition.entryNode,
    definition.exitNode,
    ...definition.nodes,
  ];

  // initialize map
  for (const node of nodes) {
    const id = getNodeId(node);
    map[id] = {
      children: findDirectChildren(id, definition),
      descendents: new Set<string>(),
      parents: new Set<string>(),
      ancestors: new Set<string>(),
    };
  }

  // fill children, parents, and descendant, ancestor relationships
  for (const node of nodes) {
    const id = getNodeId(node);

    const queue: JourneyNode[] = Array.from(
      findDirectChildren(id, definition).values()
    ).flatMap((childId) => nodes.find((n) => getNodeId(n) === childId) ?? []);

    while (queue.length > 0) {
      const currentChild = queue.shift();
      if (!currentChild) {
        throw new Error("Queue should not be empty");
      }
      const childId = getNodeId(currentChild);

      // add to descendents of parent and ancestors of child
      map[id]?.descendents.add(childId);
      map[childId]?.ancestors.add(id);

      // add parents to child and children to parent
      for (const parentId of map[id]?.ancestors.values() ?? []) {
        map[parentId]?.descendents.add(childId);
        map[childId]?.ancestors.add(parentId);
      }

      // add children to parent and parents to child
      for (const cid of map[childId]?.descendents.values() ?? []) {
        map[id]?.descendents.add(cid);
        map[cid]?.ancestors.add(id);
      }

      // add children of current child to queue
      const grandchildren = Array.from(
        map[childId]?.children.values() ?? []
      ).flatMap(
        (grandChildId) => nodes.find((n) => getNodeId(n) === grandChildId) ?? []
      );

      queue.push(...grandchildren);
    }
  }

  return map;
}
