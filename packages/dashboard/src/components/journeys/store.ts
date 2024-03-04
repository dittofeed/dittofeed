import { idxUnsafe } from "isomorphic-lib/src/arrays";
import {
  buildHeritageMap,
  getNearestFromChildren,
  getNodeId,
  HeritageMap,
} from "isomorphic-lib/src/journeys";
import { getUnsafe } from "isomorphic-lib/src/maps";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  CompletionStatus,
  DelayNode,
  DelayVariantType,
  EntryNode,
  EventEntryNode,
  ExitNode,
  JourneyBodyNode,
  JourneyDefinition,
  JourneyNode,
  JourneyNodeType,
  JourneyResource,
  MessageNode,
  SegmentEntryNode,
  SegmentSplitNode,
  SegmentSplitVariantType,
  WaitForNode,
  WaitForSegmentChild,
} from "isomorphic-lib/src/types";
import { err, ok, Result } from "neverthrow";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
} from "reactflow";
import { sortBy } from "remeda/dist/commonjs/sortBy";
import { type immer } from "zustand/middleware/immer";

import {
  AdditionalJourneyNodeType,
  AddNodesParams,
  DelayNodeProps,
  EdgeData,
  EntryNodeProps,
  ExitNodeProps,
  JourneyContent,
  JourneyNodeProps,
  JourneyState,
  MessageNodeProps,
  NodeData,
  NodeTypeProps,
  NonJourneyNodeData,
  SegmentSplitNodeProps,
  UiDelayVariant,
  WaitForNodeProps,
} from "../../lib/types";
import { durationDescription } from "../durationDescription";
import {
  buildNodesIndex,
  defaultEdges,
  defaultNodes,
  placeholderNodePosition,
} from "./defaults";
import findJourneyNode from "./findJourneyNode";
import findNode from "./findNode";
import { isLabelNode } from "./isLabelNode";
import { layoutNodes } from "./layoutNodes";
import { ENTRY_TYPES } from "isomorphic-lib/src/constants";

export type JourneyStateForResource = Pick<
  JourneyState,
  "journeyNodes" | "journeyEdges" | "journeyNodesIndex" | "journeyName"
>;

export function findDirectUiParents(
  parentId: string,
  edges: JourneyContent["journeyEdges"],
): string[] {
  return edges.flatMap((e) => (e.target === parentId ? e.source : []));
}

export function findDirectUiChildren(
  parentId: string,
  edges: JourneyContent["journeyEdges"],
): string[] {
  const isEntry = ENTRY_TYPES.has(parentId);
  const idToMatch = isEntry ? AdditionalJourneyNodeType.UiEntryNode : parentId;
  return edges.flatMap((e) => (e.source === idToMatch ? e.target : []));
}

export const WAIT_FOR_SATISFY_LABEL = "In segment";

export function waitForTimeoutLabel(timeoutSeconds?: number): string {
  return `Timed out after ${durationDescription(timeoutSeconds)}`;
}

type JourneyNodeMap = Map<string, NodeTypeProps>;

function buildJourneyNodeMap(journeyNodes: Node<NodeData>[]): JourneyNodeMap {
  const jn: JourneyNodeMap = journeyNodes.reduce((acc, node) => {
    if (node.data.type === "JourneyNode") {
      acc.set(node.id, node.data.nodeTypeProps);
    }
    return acc;
  }, new Map());
  return jn;
}

function buildUiHeritageMap(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): HeritageMap {
  const map: HeritageMap = new Map();

  // initialize map
  for (const node of nodes) {
    const { id } = node;
    map.set(id, {
      children: new Set(findDirectUiChildren(id, edges)),
      descendants: new Set<string>(),
      parents: new Set<string>(),
      ancestors: new Set<string>(),
    });
  }

  // fill children, parents, and descendant, ancestor relationships
  for (const node of nodes) {
    const { id } = node;

    const queue = Array.from(findDirectUiChildren(id, edges).values()).flatMap(
      (childId) => nodes.find((n) => n.id === childId) ?? [],
    );

    queue.forEach((childNode) => {
      const childId = childNode.id;
      map.get(childId)?.parents.add(id);
    });

    while (queue.length > 0) {
      const currentChild = queue.shift();
      if (!currentChild) {
        throw new Error("Queue should not be empty");
      }
      const childId = currentChild.id;

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
        (grandChildId) => nodes.find((n) => n.id === grandChildId) ?? [],
      );

      queue.push(...grandchildren);
    }
  }

  return map;
}

export function getNearestUiFromChildren(
  nId: string,
  hm: HeritageMap,
): string | null {
  const hmEntry = getUnsafe(hm, nId);

  const children = Array.from(hmEntry.children);
  if (children.length <= 1) {
    return null;
  }

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

export function getNearestJourneyFromChildren(
  nId: string,
  hm: HeritageMap,
  uiJourneyNodes: JourneyNodeMap,
): string {
  const hmEntry = getUnsafe(hm, nId);

  const children = Array.from(hmEntry.children);
  if (children.length <= 1) {
    throw new Error(`Expected at least 2 children for ${nId}`);
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
      if (!uiJourneyNodes.has(d)) {
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

function findNextJourneyNode(
  nodeId: string,
  hm: HeritageMap,
  uiJourneyNodes: Map<string, NodeTypeProps>,
): string {
  let hmEntry = getUnsafe(hm, nodeId);
  let child: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    const children = Array.from(hmEntry.children);
    child = idxUnsafe(children, 0);
    if (uiJourneyNodes.has(child)) {
      break;
    }
    hmEntry = getUnsafe(hm, child);
  }
  if (!child) {
    throw new Error(`Missing child for ${nodeId}`);
  }
  return child;
}

function journeyDefinitionFromStateBranch(
  initialNodeId: string,
  hm: HeritageMap,
  nodes: JourneyNode[],
  uiJourneyNodes: JourneyNodeMap,
  edges: Edge<EdgeData>[],
  terminateBefore?: string,
): Result<null, { message: string; nodeId: string }> {
  let nId = initialNodeId;
  let nextId: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    const uiNode = getUnsafe(uiJourneyNodes, nId);

    switch (uiNode.type) {
      case AdditionalJourneyNodeType.UiEntryNode: {
        const child = findNextJourneyNode(nId, hm, uiJourneyNodes);

        switch (uiNode.variant.type) {
          case JourneyNodeType.SegmentEntryNode: {
            if (!uiNode.variant.segment) {
              return err({
                message: "Entry node must have a segment",
                nodeId: nId,
              });
            }

            const node: SegmentEntryNode = {
              type: JourneyNodeType.SegmentEntryNode,
              segment: uiNode.variant.segment,
              child,
            };
            nodes.push(node);
            nextId = child;
            break;
          }
          case JourneyNodeType.EventEntryNode: {
            if (!uiNode.variant.event) {
              return err({
                message: "Entry node must have an event",
                nodeId: nId,
              });
            }
            const node: EventEntryNode = {
              type: JourneyNodeType.EventEntryNode,
              event: uiNode.variant.event,
              child,
            };
            nodes.push(node);
            nextId = child;
            break;
          }
          default:
            assertUnreachable(uiNode.variant);
            break;
        }
        break;
      }
      case JourneyNodeType.ExitNode: {
        const node: ExitNode = {
          type: JourneyNodeType.ExitNode,
        };
        nodes.push(node);
        nextId = null;
        break;
      }
      case JourneyNodeType.MessageNode: {
        if (!uiNode.templateId) {
          return err({
            message: "Message node must have a template",
            nodeId: nId,
          });
        }

        const child = findNextJourneyNode(nId, hm, uiJourneyNodes);
        const node: MessageNode = {
          id: nId,
          type: JourneyNodeType.MessageNode,
          name: uiNode.name,
          subscriptionGroupId: uiNode.subscriptionGroupId,
          variant: {
            type: uiNode.channel,
            templateId: uiNode.templateId,
          },
          child,
        };
        nodes.push(node);
        nextId = child;
        break;
      }
      case JourneyNodeType.DelayNode: {
        let variant: DelayNode["variant"];
        switch (uiNode.variant.type) {
          case DelayVariantType.Second: {
            if (!uiNode.variant.seconds) {
              return err({
                message: "Delay node must have a timeout",
                nodeId: nId,
              });
            }
            variant = {
              type: DelayVariantType.Second,
              seconds: uiNode.variant.seconds,
            };
            break;
          }
          case DelayVariantType.LocalTime: {
            if (!uiNode.variant.hour) {
              return err({
                message: "Local time delay node must have an hour",
                nodeId: nId,
              });
            }
            if (!uiNode.variant.minute) {
              return err({
                message: "Local time delay node must have a minute",
                nodeId: nId,
              });
            }
            variant = {
              type: DelayVariantType.LocalTime,
              minute: uiNode.variant.minute,
              hour: uiNode.variant.hour,
              allowedDaysOfWeek: uiNode.variant.allowedDaysOfWeek,
            };
            break;
          }
          default:
            assertUnreachable(uiNode.variant);
        }
        const child = findNextJourneyNode(nId, hm, uiJourneyNodes);
        const node: DelayNode = {
          type: JourneyNodeType.DelayNode,
          id: nId,
          variant,
          child,
        };
        nodes.push(node);
        nextId = child;
        break;
      }
      case JourneyNodeType.WaitForNode: {
        if (!uiNode.timeoutSeconds) {
          return err({
            message: "Wait for node must have a timeout",
            nodeId: nId,
          });
        }
        const nfc = getNearestJourneyFromChildren(nId, hm, uiJourneyNodes);
        const timeoutChild = findNextJourneyNode(
          uiNode.timeoutLabelNodeId,
          hm,
          uiJourneyNodes,
        );

        if (nfc !== timeoutChild) {
          const branchResult = journeyDefinitionFromStateBranch(
            timeoutChild,
            hm,
            nodes,
            uiJourneyNodes,
            edges,
            nfc,
          );
          if (branchResult.isErr()) {
            return err(branchResult.error);
          }
        }

        const segmentChildren: WaitForSegmentChild[] = [];
        for (const segmentChild of uiNode.segmentChildren) {
          if (!segmentChild.segmentId) {
            return err({
              message: "All wait for segment children must have a segment",
              nodeId: nId,
            });
          }
          const child = findNextJourneyNode(
            segmentChild.labelNodeId,
            hm,
            uiJourneyNodes,
          );

          if (nfc !== child) {
            const branchResult = journeyDefinitionFromStateBranch(
              child,
              hm,
              nodes,
              uiJourneyNodes,
              edges,
              nfc,
            );
            if (branchResult.isErr()) {
              return err(branchResult.error);
            }
          }
          segmentChildren.push({
            id: child,
            segmentId: segmentChild.segmentId,
          });
        }

        const node: WaitForNode = {
          type: JourneyNodeType.WaitForNode,
          timeoutSeconds: uiNode.timeoutSeconds,
          timeoutChild,
          segmentChildren,
          id: nId,
        };
        nodes.push(node);
        nextId = nfc;
        break;
      }
      case JourneyNodeType.SegmentSplitNode: {
        if (!uiNode.segmentId) {
          return err({
            message: "Segment split node must have a segment",
            nodeId: nId,
          });
        }
        const trueChild = findNextJourneyNode(
          uiNode.trueLabelNodeId,
          hm,
          uiJourneyNodes,
        );

        const nfc = getNearestJourneyFromChildren(nId, hm, uiJourneyNodes);
        if (nfc !== trueChild) {
          const branchResult = journeyDefinitionFromStateBranch(
            trueChild,
            hm,
            nodes,
            uiJourneyNodes,
            edges,
            nfc,
          );
          if (branchResult.isErr()) {
            return err(branchResult.error);
          }
        }

        const falseChild = findNextJourneyNode(
          uiNode.falseLabelNodeId,
          hm,
          uiJourneyNodes,
        );

        if (nfc !== falseChild) {
          const branchResult = journeyDefinitionFromStateBranch(
            falseChild,
            hm,
            nodes,
            uiJourneyNodes,
            edges,
            nfc,
          );
          if (branchResult.isErr()) {
            return err(branchResult.error);
          }
        }

        const node: SegmentSplitNode = {
          type: JourneyNodeType.SegmentSplitNode,
          id: nId,
          variant: {
            type: SegmentSplitVariantType.Boolean,
            segment: uiNode.segmentId,
            trueChild,
            falseChild,
          },
        };
        nodes.push(node);
        nextId = nfc;
        break;
      }
      default:
        assertUnreachable(uiNode);
    }
    if (nextId === null) {
      break;
    }
    if (nextId === terminateBefore) {
      break;
    }
    nId = nextId;
  }
  return ok(null);
}

export function journeyDefinitionFromState({
  state,
}: {
  state: Omit<JourneyStateForResource, "journeyName">;
}): Result<JourneyDefinition, { message: string; nodeId: string }> {
  const nodes: JourneyNode[] = [];
  const journeyNodes = buildJourneyNodeMap(state.journeyNodes);
  const hm = buildUiHeritageMap(state.journeyNodes, state.journeyEdges);

  const result = journeyDefinitionFromStateBranch(
    AdditionalJourneyNodeType.UiEntryNode,
    hm,
    nodes,
    journeyNodes,
    state.journeyEdges,
  );

  if (result.isErr()) {
    return err(result.error);
  }
  let exitNode: ExitNode | null = null;
  let entryNode: EntryNode | null = null;
  const bodyNodes: JourneyBodyNode[] = [];

  for (const node of nodes) {
    if (
      node.type === JourneyNodeType.SegmentEntryNode ||
      node.type === JourneyNodeType.EventEntryNode
    ) {
      entryNode = node;
    } else if (node.type === JourneyNodeType.ExitNode) {
      exitNode = node;
    } else {
      bodyNodes.push(node);
    }
  }

  if (!entryNode) {
    throw new Error("Entry node is missing");
  }
  if (!exitNode) {
    throw new Error("Exit node is missing");
  }

  const definition: JourneyDefinition = {
    entryNode,
    exitNode,
    nodes: bodyNodes,
  };
  return ok(definition);
}

export interface DualNodeParams {
  leftId: string;
  rightId: string;
  emptyId: string;
}

export function dualNodeNonJourneyNodes({
  leftId,
  rightId,
  leftLabel,
  rightLabel,
  emptyId,
}: DualNodeParams & {
  leftLabel: string;
  rightLabel: string;
}): Node<NonJourneyNodeData>[] {
  return [
    {
      id: leftId,
      position: placeholderNodePosition,
      type: "label",
      data: {
        type: "LabelNode",
        title: leftLabel,
      },
    },
    {
      id: rightId,
      position: placeholderNodePosition,
      type: "label",
      data: {
        type: "LabelNode",
        title: rightLabel,
      },
    },
    {
      id: emptyId,
      position: placeholderNodePosition,
      type: "empty",
      data: {
        type: "EmptyNode",
      },
    },
  ];
}

export function dualNodeEdges({
  leftId,
  rightId,
  emptyId,
  nodeId,
  source,
  target,
}: DualNodeParams & {
  source: string;
  target: string;
  nodeId: string;
}): Edge<EdgeData>[] {
  const edges: Edge<EdgeData>[] = [
    {
      id: `${source}=>${nodeId}`,
      source,
      target: nodeId,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: "WorkflowEdge",
        disableMarker: true,
      },
    },
    {
      id: `${nodeId}=>${leftId}`,
      source: nodeId,
      target: leftId,
      type: "placeholder",
      sourceHandle: "bottom",
    },
    {
      id: `${nodeId}=>${rightId}`,
      source: nodeId,
      target: rightId,
      type: "placeholder",
      sourceHandle: "bottom",
    },
    {
      id: `${leftId}=>${emptyId}`,
      source: leftId,
      target: emptyId,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: "WorkflowEdge",
        disableMarker: true,
      },
    },
    {
      id: `${rightId}=>${emptyId}`,
      source: rightId,
      target: emptyId,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: "WorkflowEdge",
        disableMarker: true,
      },
    },
  ];
  if (target) {
    edges.push({
      id: `${emptyId}=>${target}`,
      source: emptyId,
      target,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: "WorkflowEdge",
        disableMarker: true,
      },
    });
  }
  return edges;
}

export function edgesForJourneyNode({
  type,
  nodeId,
  source,
  target,
  leftId,
  rightId,
  emptyId,
}: {
  type: JourneyNodeType;
  nodeId: string;
  source: string;
  target: string;
  leftId?: string;
  rightId?: string;
  emptyId?: string;
}): Edge<EdgeData>[] {
  if (
    type === JourneyNodeType.SegmentSplitNode ||
    type === JourneyNodeType.WaitForNode
  ) {
    if (!leftId || !rightId || !emptyId) {
      throw new Error("Missing dual node ids");
    }
    return dualNodeEdges({
      source,
      target,
      nodeId,
      leftId,
      rightId,
      emptyId,
    });
  }
  if (
    type === JourneyNodeType.RateLimitNode ||
    type === JourneyNodeType.ExperimentSplitNode ||
    type === JourneyNodeType.SegmentEntryNode ||
    type === JourneyNodeType.ExitNode
  ) {
    throw new Error(`Unimplemented node type ${type}`);
  }

  const edges: Edge<EdgeData>[] = [
    {
      id: `${source}=>${nodeId}`,
      source,
      target: nodeId,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: "WorkflowEdge",
      },
    },
  ];
  if (target) {
    edges.push({
      id: `${nodeId}=>${target}`,
      source: nodeId,
      target,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: "WorkflowEdge",
      },
    });
  }
  return edges;
}

export function newStateFromNodes({
  source,
  target,
  nodes,
  existingNodes,
  edges,
  existingEdges,
}: AddNodesParams & {
  existingNodes: Node<NodeData>[];
  existingEdges: Edge<EdgeData>[];
}): {
  edges: Edge<EdgeData>[];
  nodes: Node<NodeData>[];
} {
  const newEdges = existingEdges
    .filter((e) => !(e.source === source && e.target === target))
    .concat(edges);

  const newNodes = existingNodes.concat(nodes);

  return {
    edges: newEdges,
    nodes: newNodes,
  };
}

/**
 * find all descendants of parent node with relative depth of node
 * @param parentId
 * @param edges
 * @returns
 */
export function findAllDescendants(
  parentId: string,
  edges: JourneyContent["journeyEdges"],
): Map<string, number> {
  const children = new Map<string, number>();
  const unprocessed = [{ node: parentId, depth: 0 }];

  while (unprocessed.length) {
    const next = unprocessed.pop();
    if (!next) {
      throw new Error("next should exist");
    }

    const directChildren = findDirectUiChildren(next.node, edges);

    for (const child of directChildren) {
      if (!children.has(child)) {
        unprocessed.push({ node: child, depth: next.depth + 1 });
        children.set(child, next.depth + 1);
      }
    }
  }
  return children;
}

type CreateJourneySlice = Parameters<typeof immer<JourneyContent>>[0];

function buildLabelNode(id: string, title: string): Node<NodeData> {
  return {
    id,
    position: placeholderNodePosition,
    type: "label",
    data: {
      type: "LabelNode",
      title,
    },
  };
}

function buildEmptyNode(id: string): Node<NodeData> {
  return {
    id,
    position: placeholderNodePosition,
    type: "empty",
    data: {
      type: "EmptyNode",
    },
  };
}

function buildWorkflowEdge(source: string, target: string): Edge<EdgeData> {
  return {
    id: `${source}=>${target}`,
    source,
    target,
    type: "workflow",
    sourceHandle: "bottom",
    data: {
      type: "WorkflowEdge",
      disableMarker: true,
    },
  };
}

function buildPlaceholderEdge(source: string, target: string): Edge<EdgeData> {
  return {
    id: `${source}=>${target}`,
    source,
    target,
    type: "placeholder",
    sourceHandle: "bottom",
  };
}

function buildJourneyNode(
  id: string,
  nodeTypeProps: NodeTypeProps,
): Node<JourneyNodeProps> {
  return {
    id,
    position: placeholderNodePosition,
    type: "journey",
    data: {
      type: "JourneyNode",
      nodeTypeProps,
    },
  };
}

export const createJourneySlice: CreateJourneySlice = (set) => ({
  journeySelectedNodeId: null,
  journeyNodes: defaultNodes,
  journeyEdges: defaultEdges,
  journeyNodesIndex: buildNodesIndex(defaultNodes),
  journeyDraggedComponentType: null,
  journeyName: "",
  journeyUpdateRequest: {
    type: CompletionStatus.NotStarted,
  },
  journeyStatsRequest: {
    type: CompletionStatus.NotStarted,
  },
  journeyStats: {},
  upsertJourneyStats: (stats) =>
    set((state) => {
      for (const journeyStats of stats) {
        state.journeyStats[journeyStats.journeyId] = journeyStats;
      }
    }),
  setEdges: (changes: EdgeChange[]) =>
    set((state) => {
      state.journeyEdges = applyEdgeChanges(changes, state.journeyEdges);
    }),
  deleteJourneyNode: (nodeId: string) =>
    set((state) => {
      const hm = buildUiHeritageMap(state.journeyNodes, state.journeyEdges);
      const hmEntry = getUnsafe(hm, nodeId);

      // Will be an empty node
      const nfc = getNearestUiFromChildren(nodeId, hm);
      const nodesToRemove = new Set<string>([nodeId]);
      let terminalNode: string;
      if (nfc) {
        nodesToRemove.add(nfc);
        for (const n of state.journeyNodes) {
          const nHmEntry = getUnsafe(hm, n.id);
          if (nHmEntry.descendants.has(nfc) && nHmEntry.ancestors.has(nodeId)) {
            nodesToRemove.add(n.id);
          }
        }
        terminalNode = nfc;
      } else {
        terminalNode = nodeId;
      }

      state.journeyNodes = state.journeyNodes.filter(
        (n) => !nodesToRemove.has(n.id),
      );
      state.journeyEdges = state.journeyEdges.filter(
        (e) => !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target),
      );

      const terminalHmEntry = getUnsafe(hm, terminalNode);
      const newTarget = idxUnsafe(Array.from(terminalHmEntry.children), 0);
      const source = idxUnsafe(Array.from(hmEntry.parents), 0);
      state.journeyEdges.push(buildWorkflowEdge(source, newTarget));

      state.journeyNodes = layoutNodes(state.journeyNodes, state.journeyEdges);
      state.journeyNodesIndex = buildNodesIndex(state.journeyNodes);
    }),
  setNodes: (changes: NodeChange[]) =>
    set((state) => {
      state.journeyNodes = applyNodeChanges(changes, state.journeyNodes);
    }),
  addNodes: ({ source, target, nodes, edges }) =>
    set((state) => {
      const newState = newStateFromNodes({
        source,
        target,
        nodes,
        edges,
        existingNodes: state.journeyNodes,
        existingEdges: state.journeyEdges,
      });
      state.journeyNodes = layoutNodes(newState.nodes, newState.edges);
      state.journeyEdges = newState.edges;
      state.journeyNodesIndex = buildNodesIndex(state.journeyNodes);
    }),
  setDraggedComponentType: (t) =>
    set((state) => {
      state.journeyDraggedComponentType = t;
    }),
  setSelectedNodeId: (selectedNodeId: string | null) =>
    set((state) => {
      state.journeySelectedNodeId = selectedNodeId;
    }),
  updateJourneyNodeData: (nodeId, updater) =>
    set((state) => {
      const node = findJourneyNode(
        nodeId,
        state.journeyNodes,
        state.journeyNodesIndex,
      );
      if (node) {
        updater(node);
      }
    }),
  setJourneyUpdateRequest: (request) =>
    set((state) => {
      state.journeyUpdateRequest = request;
    }),
  setJourneyStatsRequest(request) {
    set((state) => {
      state.journeyStatsRequest = request;
    });
  },
  setJourneyName: (name) =>
    set((state) => {
      state.journeyName = name;
    }),
  updateLabelNode: (nodeId, title) =>
    set((state) => {
      const node = findNode(
        nodeId,
        state.journeyNodes,
        state.journeyNodesIndex,
      );
      if (node && isLabelNode(node)) {
        node.data.title = title;
      }
    }),
});

export function journeyBranchToState(
  initialNodeId: string,
  nodesState: Node<NodeData>[],
  edgesState: Edge<EdgeData>[],
  nodes: Map<string, JourneyNode>,
  hm: HeritageMap,
  terminateBefore?: string,
): {
  terminalNode: string | null;
} {
  let nId: string = initialNodeId;
  let node = getUnsafe(nodes, nId);
  let nextNodeId: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    switch (node.type) {
      case JourneyNodeType.SegmentEntryNode: {
        const entryNode: EntryNodeProps = {
          type: AdditionalJourneyNodeType.UiEntryNode,
          variant: {
            type: JourneyNodeType.SegmentEntryNode,
            segment: node.segment,
          },
        };
        nodesState.push(
          buildJourneyNode(AdditionalJourneyNodeType.UiEntryNode, entryNode),
        );
        edgesState.push(
          buildWorkflowEdge(AdditionalJourneyNodeType.UiEntryNode, node.child),
        );
        nextNodeId = node.child;
        break;
      }
      case JourneyNodeType.EventEntryNode: {
        const entryNode: EntryNodeProps = {
          type: AdditionalJourneyNodeType.UiEntryNode,
          variant: {
            type: JourneyNodeType.EventEntryNode,
            event: node.event,
          },
        };
        nodesState.push(
          buildJourneyNode(AdditionalJourneyNodeType.UiEntryNode, entryNode),
        );
        edgesState.push(
          buildWorkflowEdge(AdditionalJourneyNodeType.UiEntryNode, node.child),
        );
        nextNodeId = node.child;
        break;
      }
      case JourneyNodeType.ExitNode: {
        const exitNode: ExitNodeProps = {
          type: JourneyNodeType.ExitNode,
        };
        nodesState.push(buildJourneyNode(nId, exitNode));
        nextNodeId = null;

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (nextNodeId === terminateBefore) {
          return {
            terminalNode: nId,
          };
        }
        break;
      }
      case JourneyNodeType.DelayNode: {
        let variant: UiDelayVariant;
        switch (node.variant.type) {
          case DelayVariantType.Second: {
            variant = {
              type: DelayVariantType.Second,
              seconds: node.variant.seconds,
            };
            break;
          }
          case DelayVariantType.LocalTime: {
            variant = {
              type: DelayVariantType.LocalTime,
              hour: node.variant.hour,
              minute: node.variant.minute,
              allowedDaysOfWeek: node.variant.allowedDaysOfWeek,
            };
            break;
          }
          default:
            assertUnreachable(node.variant);
        }

        const delayNode: DelayNodeProps = {
          type: JourneyNodeType.DelayNode,
          variant,
        };

        nodesState.push(buildJourneyNode(nId, delayNode));
        nextNodeId = node.child;

        if (nextNodeId === terminateBefore) {
          return {
            terminalNode: nId,
          };
        }
        edgesState.push(buildWorkflowEdge(nId, node.child));
        break;
      }
      case JourneyNodeType.MessageNode: {
        const messageNode: MessageNodeProps = {
          type: JourneyNodeType.MessageNode,
          templateId: node.variant.templateId,
          channel: node.variant.type,
          name: node.name ?? "",
          subscriptionGroupId: node.subscriptionGroupId,
        };
        nodesState.push(buildJourneyNode(nId, messageNode));
        nextNodeId = node.child;

        if (nextNodeId === terminateBefore) {
          return {
            terminalNode: nId,
          };
        }
        edgesState.push(buildWorkflowEdge(nId, node.child));
        break;
      }
      case JourneyNodeType.ExperimentSplitNode:
        throw new Error("ExperimentSplitNode is not implemented");
      case JourneyNodeType.RateLimitNode:
        throw new Error("RateLimitNode is not implemented");
      case JourneyNodeType.SegmentSplitNode: {
        const trueId = `${nId}-child-0`;
        const falseId = `${nId}-child-1`;
        const emptyId = `${nId}-empty`;

        const segmentSplitNode: SegmentSplitNodeProps = {
          type: JourneyNodeType.SegmentSplitNode,
          segmentId: node.variant.segment,
          name: node.name ?? "",
          trueLabelNodeId: trueId,
          falseLabelNodeId: falseId,
        };
        nodesState.push(buildJourneyNode(nId, segmentSplitNode));
        nodesState.push(buildLabelNode(trueId, "true"));
        nodesState.push(buildLabelNode(falseId, "false"));
        nodesState.push(buildEmptyNode(emptyId));
        edgesState.push(buildPlaceholderEdge(nId, trueId));
        edgesState.push(buildPlaceholderEdge(nId, falseId));

        const nfc = getNearestFromChildren(nId, hm);

        if (node.variant.trueChild === nfc || nfc === null) {
          edgesState.push(buildWorkflowEdge(trueId, emptyId));
        } else {
          edgesState.push(buildWorkflowEdge(trueId, node.variant.trueChild));

          const terminalId = journeyBranchToState(
            node.variant.trueChild,
            nodesState,
            edgesState,
            nodes,
            hm,
            nfc,
          ).terminalNode;
          if (!terminalId) {
            throw new Error(
              "segment split children terminate which should not be possible",
            );
          }
          edgesState.push(buildWorkflowEdge(terminalId, emptyId));
        }

        if (node.variant.falseChild === nfc || nfc === null) {
          edgesState.push(buildWorkflowEdge(falseId, emptyId));
        } else {
          edgesState.push(buildWorkflowEdge(falseId, node.variant.falseChild));

          const terminalId = journeyBranchToState(
            node.variant.falseChild,
            nodesState,
            edgesState,
            nodes,
            hm,
            nfc,
          ).terminalNode;
          if (!terminalId) {
            throw new Error(
              "segment split children terminate which should not be possible",
            );
          }
          edgesState.push(buildWorkflowEdge(terminalId, emptyId));
        }

        // default to true child because will be null if both children are equal
        nextNodeId = nfc ?? node.variant.trueChild;

        if (nextNodeId === terminateBefore) {
          return {
            terminalNode: emptyId,
          };
        }
        edgesState.push(buildWorkflowEdge(emptyId, nextNodeId));
        break;
      }
      case JourneyNodeType.WaitForNode: {
        const segmentChild = node.segmentChildren[0];
        if (!segmentChild) {
          throw new Error("Malformed journey, WaitForNode has no children.");
        }
        const segmentChildLabelId = `${nId}-child-0`;
        const timeoutId = `${nId}-child-1`;
        const emptyId = `${nId}-empty`;
        const waitForNodeProps: WaitForNodeProps = {
          type: JourneyNodeType.WaitForNode,
          timeoutLabelNodeId: timeoutId,
          timeoutSeconds: node.timeoutSeconds,
          segmentChildren: [
            {
              segmentId: segmentChild.segmentId,
              labelNodeId: segmentChildLabelId,
            },
          ],
        };

        nodesState.push(buildJourneyNode(nId, waitForNodeProps));
        nodesState.push(
          buildLabelNode(segmentChildLabelId, WAIT_FOR_SATISFY_LABEL),
        );
        nodesState.push(
          buildLabelNode(timeoutId, waitForTimeoutLabel(node.timeoutSeconds)),
        );
        nodesState.push(buildEmptyNode(emptyId));
        edgesState.push(buildPlaceholderEdge(nId, segmentChildLabelId));
        edgesState.push(buildPlaceholderEdge(nId, timeoutId));

        const nfc = getNearestFromChildren(nId, hm);

        if (segmentChild.id === nfc || nfc === null) {
          edgesState.push(buildWorkflowEdge(segmentChildLabelId, emptyId));
        } else {
          edgesState.push(
            buildWorkflowEdge(segmentChildLabelId, segmentChild.id),
          );

          const terminalId = journeyBranchToState(
            segmentChild.id,
            nodesState,
            edgesState,
            nodes,
            hm,
            nfc,
          ).terminalNode;
          if (!terminalId) {
            throw new Error(
              "segment split children terminate which should not be possible",
            );
          }
          edgesState.push(buildWorkflowEdge(terminalId, emptyId));
        }

        if (node.timeoutChild === nfc || nfc === null) {
          edgesState.push(buildWorkflowEdge(timeoutId, emptyId));
        } else {
          edgesState.push(buildWorkflowEdge(timeoutId, node.timeoutChild));

          const terminalId = journeyBranchToState(
            node.timeoutChild,
            nodesState,
            edgesState,
            nodes,
            hm,
            nfc,
          ).terminalNode;
          if (!terminalId) {
            throw new Error("children terminate which should not be possible");
          }
          edgesState.push(buildWorkflowEdge(terminalId, emptyId));
        }

        // default to true child because will be null if both children are equal
        nextNodeId = nfc ?? segmentChild.id;

        if (nextNodeId === terminateBefore) {
          return {
            terminalNode: emptyId,
          };
        }
        edgesState.push(buildWorkflowEdge(emptyId, nextNodeId));
        break;
      }
    }

    if (!nextNodeId) {
      break;
    }
    const nextNode = getUnsafe(nodes, nextNodeId);
    node = nextNode;
    nId = nextNodeId;
  }

  return {
    terminalNode: null,
  };
}

export function journeyToState(
  journey: Omit<JourneyResource, "id" | "status" | "workspaceId">,
): JourneyStateForResource {
  const journeyEdges: Edge<EdgeData>[] = [];
  let journeyNodes: Node<NodeData>[] = [];
  const nodes = [
    journey.definition.entryNode,
    ...journey.definition.nodes,
    journey.definition.exitNode,
  ].reduce((acc, node) => {
    acc.set(getNodeId(node), node);
    return acc;
  }, new Map<string, JourneyNode>());
  const hm = buildHeritageMap(journey.definition);

  journeyBranchToState(
    getNodeId(journey.definition.entryNode),
    journeyNodes,
    journeyEdges,
    nodes,
    hm,
  );
  journeyNodes = layoutNodes(journeyNodes, journeyEdges);
  const journeyNodesIndex = buildNodesIndex(journeyNodes);
  return {
    journeyName: journey.name,
    journeyNodes,
    journeyNodesIndex,
    journeyEdges,
  };
}
