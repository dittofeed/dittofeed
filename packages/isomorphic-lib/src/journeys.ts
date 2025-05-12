import { sortBy } from "remeda";

import { getUnsafe } from "./maps";
import { assertUnreachable } from "./typeAssertions";
import {
  JourneyBodyNode,
  JourneyConstraintViolation,
  JourneyConstraintViolationType,
  JourneyDefinition,
  JourneyNode,
  JourneyNodeType,
  JourneyResourceStatus,
  JourneyResourceStatusEnum,
} from "./types";

export function getNodeId(node: JourneyNode): string {
  if (node.type === JourneyNodeType.SegmentEntryNode) {
    return JourneyNodeType.SegmentEntryNode;
  }
  if (node.type === JourneyNodeType.EventEntryNode) {
    return JourneyNodeType.EventEntryNode;
  }
  if (node.type === JourneyNodeType.ExitNode) {
    return JourneyNodeType.ExitNode;
  }
  return node.id;
}

export function getJourneyConstraintViolations({
  newStatus,
  definition,
}: {
  newStatus?: JourneyResourceStatus;
  definition?: JourneyDefinition;
}): JourneyConstraintViolation[] {
  const constraintViolations: JourneyConstraintViolation[] = [];

  if (definition) {
    const hasWaitForNode = definition.nodes.some(
      (n) => n.type === JourneyNodeType.WaitForNode,
    );
    const hasEventEntry =
      definition.entryNode.type === JourneyNodeType.EventEntryNode;

    if (hasEventEntry && hasWaitForNode) {
      constraintViolations.push({
        type: JourneyConstraintViolationType.WaitForNodeAndEventEntryNode,
        message:
          "A journey cannot have both an Event Entry node and a Wait For node",
      });
    }
  } else if (newStatus !== JourneyResourceStatusEnum.NotStarted) {
    constraintViolations.push({
      type: JourneyConstraintViolationType.CantStart,
      message: "Draft journey must have a definition to be started",
    });
  }
  return constraintViolations;
}

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

export function isMultiChildNode(type: JourneyNodeType): boolean {
  if (
    type === JourneyNodeType.SegmentSplitNode ||
    type === JourneyNodeType.WaitForNode
  ) {
    return true;
  }
  return false;
}

/**
 * Returns the set of segments that this journey depends on.
 * @param definition
 * @returns
 */
export function getSubscribedSegments(
  definition: JourneyDefinition,
): Set<string> {
  const subscribedSegments = new Set<string>();
  if (definition.entryNode.type === JourneyNodeType.SegmentEntryNode) {
    subscribedSegments.add(definition.entryNode.segment);
  }
  for (const node of definition.nodes) {
    const segments = nodeToSegments(node);
    for (const segment of segments) {
      subscribedSegments.add(segment);
    }
  }
  return subscribedSegments;
}

/**
 * Returns the set of message templates that this journey depends on.
 * @param definition
 * @returns
 */
export function getMessageTemplates(
  definition: JourneyDefinition,
): Set<string> {
  const subscribedMessageTemplates = new Set<string>();
  for (const node of definition.nodes) {
    if (node.type === JourneyNodeType.MessageNode) {
      subscribedMessageTemplates.add(node.variant.templateId);
    }
  }
  return subscribedMessageTemplates;
}

const ENTRY_NODE_TYPES = new Set<string>([
  JourneyNodeType.EventEntryNode,
  JourneyNodeType.SegmentEntryNode,
]);

export function getJourneyNode(
  definition: JourneyDefinition,
  nodeId: string,
): JourneyNode | null {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (ENTRY_NODE_TYPES.has(nodeId)) {
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
  definition: JourneyDefinition,
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
        ...node.segmentChildren.map((c) => c.id),
        node.timeoutChild,
      ]);
      break;
    }
    case JourneyNodeType.MessageNode:
      children = new Set<string>([node.child]);
      break;
    case JourneyNodeType.SegmentEntryNode:
      children = new Set<string>([node.child]);
      break;
    case JourneyNodeType.EventEntryNode:
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
    default:
      assertUnreachable(node);
  }

  return children;
}

export function findDirectParents(
  nodeId: string,
  definition: JourneyDefinition,
): Set<string> {
  const parents = new Set<string>();

  // Iterate over all nodes in the journey definition
  for (const node of [definition.entryNode, ...definition.nodes]) {
    const id = getNodeId(node);
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

export interface HeritageMapEntry {
  // ids of direct children nodes
  children: Set<string>;
  // ids of all N nested children of node
  descendants: Set<string>;
  // ids of direct parents of the node
  parents: Set<string>;
  // ids of all N nested parents of node
  ancestors: Set<string>;
}

export type HeritageMap = Map<
  // id of node for which heritage entry applies
  string,
  HeritageMapEntry
>;

export function buildHeritageMap(definition: JourneyDefinition): HeritageMap {
  const map: HeritageMap = new Map();
  const nodes: JourneyNode[] = [
    definition.entryNode,
    definition.exitNode,
    ...definition.nodes,
  ];

  // initialize map
  for (const node of nodes) {
    const id = getNodeId(node);
    map.set(id, {
      children: findDirectChildren(id, definition),
      descendants: new Set<string>(),
      parents: new Set<string>(),
      ancestors: new Set<string>(),
    });
  }

  // fill children, parents, and descendant, ancestor relationships
  for (const node of nodes) {
    const id = getNodeId(node);

    const queue = Array.from(
      findDirectChildren(id, definition).values(),
    ).flatMap((childId) => nodes.find((n) => getNodeId(n) === childId) ?? []);

    queue.forEach((childNode) => {
      const childId = getNodeId(childNode);
      map.get(childId)?.parents.add(id);
    });

    while (queue.length > 0) {
      const currentChild = queue.shift();
      if (!currentChild) {
        throw new Error("Queue should not be empty");
      }
      const childId = getNodeId(currentChild);

      // add to descendants of parent and ancestors of child
      map.get(id)?.descendants.add(childId);
      map.get(childId)?.ancestors.add(id);

      // add parents to child and children to parent
      for (const parentId of map.get(id)?.ancestors.values() ?? []) {
        map.get(parentId)?.descendants.add(childId);
        map.get(childId)?.ancestors.add(parentId);
      }

      // add children to parent and parents to child
      for (const cid of map.get(childId)?.descendants.values() ?? []) {
        map.get(id)?.descendants.add(cid);
        map.get(cid)?.ancestors.add(id);
      }

      // add children of current child to queue
      const grandchildren = Array.from(
        map.get(childId)?.children.values() ?? [],
      ).flatMap(
        (grandChildId) =>
          nodes.find((n) => getNodeId(n) === grandChildId) ?? [],
      );

      queue.push(...grandchildren);
    }
  }

  return map;
}

/**
 * find the descendant which has all children as ancestors, and has the smallest number of ancestors (nearest). Returns null if node only has a single child.
 * @param nId
 * @param hm
 * @returns
 */
export function getNearestFromChildren(
  nId: string,
  hm: HeritageMap,
): string | null {
  const hmEntry = getUnsafe(hm, nId);

  const children = Array.from(hmEntry.children);
  if (children.length === 1) {
    return null;
  }

  // TODO use DFS
  const nearestDescendants = sortBy(
    Array.from(hmEntry.descendants).flatMap((d) => {
      const descendantHmEntry = getUnsafe(hm, d);
      if (
        !children.every((c) => c === d || descendantHmEntry.ancestors.has(c))
      ) {
        return [];
      }
      const val: [string, number] = [d, descendantHmEntry.ancestors.size];
      return [val];
    }),
    (val) => val[1],
  );
  const nearestDescendant = nearestDescendants[0];
  if (!nearestDescendant) {
    throw new Error(`Missing nearest for ${nId}`);
  }
  return nearestDescendant[0];
}
