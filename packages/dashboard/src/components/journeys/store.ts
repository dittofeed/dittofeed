import { idxUnsafe } from "isomorphic-lib/src/arrays";
import { ENTRY_TYPES } from "isomorphic-lib/src/constants";
import { deepEquals } from "isomorphic-lib/src/equality";
import {
  buildHeritageMap,
  getNearestFromChildren,
  getNodeId,
  HeritageMap,
} from "isomorphic-lib/src/journeys";
import { getUnsafe } from "isomorphic-lib/src/maps";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  BaseMessageUiNodeProps,
  ChannelType,
  CompletionStatus,
  DelayNode,
  DelayVariantType,
  EntryNode,
  EventEntryNode,
  ExitNode,
  JourneyBodyNode,
  JourneyDefinition,
  JourneyDraft,
  JourneyNode,
  JourneyNodeType,
  JourneyResource,
  JourneyUiBodyNodeTypeProps,
  JourneyUiEdgeProps,
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
import { omit, sortBy } from "remeda";
import { v4 as uuid } from "uuid";
import { type immer } from "zustand/middleware/immer";

import {
  AdditionalJourneyNodeType,
  AddNodesParams,
  DelayUiNodeProps,
  DelayUiNodeVariant,
  EntryUiNodeProps,
  ExitUiNodeProps,
  JourneyContent,
  JourneyNodeUiProps,
  JourneyState,
  JourneyUiEdgeType,
  JourneyUiNodeDefinitionProps,
  JourneyUiNodePresentationalProps,
  JourneyUiNodeType,
  JourneyUiNodeTypeProps,
  MessageUiNodeProps,
  SegmentSplitUiNodeProps,
  WaitForUiNodeProps,
} from "../../lib/types";
import { durationDescription } from "../durationDescription";
import {
  buildNodesIndex,
  DEFAULT_EDGES,
  DEFAULT_JOURNEY_NODES,
  placeholderNodePosition,
} from "./defaults";
import findJourneyNode from "./findJourneyNode";
import findNode from "./findNode";
import { isLabelNode } from "./isLabelNode";
import { layoutNodes } from "./layoutNodes";

export type JourneyStateForResource = Pick<
  JourneyState,
  "journeyNodes" | "journeyEdges" | "journeyNodesIndex" | "journeyName"
>;

export function findDirectUiParents(
  childId: string,
  edges: JourneyContent["journeyEdges"],
): string[] {
  const isEntry = ENTRY_TYPES.has(childId);
  if (isEntry) {
    return [];
  }
  return edges.flatMap((e) => (e.target === childId ? e.source : []));
}

export function findDirectUiChildren(
  parentId: string,
  edges: JourneyContent["journeyEdges"],
): string[] {
  const isEntry = ENTRY_TYPES.has(parentId);
  const idToMatch = isEntry ? AdditionalJourneyNodeType.EntryUiNode : parentId;
  return edges.flatMap((e) => (e.source === idToMatch ? e.target : []));
}

export const WAIT_FOR_SATISFY_LABEL = "In segment";

export function waitForTimeoutLabel(timeoutSeconds?: number): string {
  return `Timed out after ${durationDescription(timeoutSeconds)}`;
}

type JourneyNodeMap = Map<string, JourneyUiNodeTypeProps>;

function buildJourneyNodeMap(
  journeyNodes: Node<JourneyNodeUiProps>[],
): JourneyNodeMap {
  const jn: JourneyNodeMap = journeyNodes.reduce((acc, node) => {
    if (node.data.type === JourneyUiNodeType.JourneyUiNodeDefinitionProps) {
      acc.set(node.id, node.data.nodeTypeProps);
    }
    return acc;
  }, new Map());
  return jn;
}

function buildUiHeritageMap(
  nodes: Node<JourneyNodeUiProps>[],
  edges: Edge<JourneyUiEdgeProps>[],
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
  uiJourneyNodes: Map<string, JourneyUiNodeTypeProps>,
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
  edges: Edge<JourneyUiEdgeProps>[],
  terminateBefore?: string,
): Result<null, { message: string; nodeId: string }> {
  let nId = initialNodeId;
  let nextId: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    const uiNode = getUnsafe(uiJourneyNodes, nId);

    switch (uiNode.type) {
      case AdditionalJourneyNodeType.EntryUiNode: {
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
        let variant: MessageNode["variant"];
        // ugly but if we combine these clauses into one then we get a type error.
        if (uiNode.channel === ChannelType.Email) {
          variant = {
            type: uiNode.channel,
            templateId: uiNode.templateId,
            providerOverride: uiNode.providerOverride,
          };
        } else if (uiNode.channel === ChannelType.Sms) {
          variant = {
            type: uiNode.channel,
            templateId: uiNode.templateId,
            providerOverride: uiNode.providerOverride,
          };
        } else {
          variant = {
            type: uiNode.channel,
            templateId: uiNode.templateId,
          };
        }
        const node: MessageNode = {
          id: nId,
          type: JourneyNodeType.MessageNode,
          name: uiNode.name,
          subscriptionGroupId: uiNode.subscriptionGroupId,
          syncProperties: uiNode.syncProperties,
          variant,
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
    AdditionalJourneyNodeType.EntryUiNode,
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
}): Node<JourneyUiNodePresentationalProps>[] {
  return [
    {
      id: leftId,
      position: placeholderNodePosition,
      type: "label",
      data: {
        type: JourneyUiNodeType.JourneyUiNodeLabelProps,
        title: leftLabel,
      },
    },
    {
      id: rightId,
      position: placeholderNodePosition,
      type: "label",
      data: {
        type: JourneyUiNodeType.JourneyUiNodeLabelProps,
        title: rightLabel,
      },
    },
    {
      id: emptyId,
      position: placeholderNodePosition,
      type: "empty",
      data: {
        type: JourneyUiNodeType.JourneyUiNodeEmptyProps,
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
}): Edge<JourneyUiEdgeProps>[] {
  const edges: Edge<JourneyUiEdgeProps>[] = [
    {
      id: `${source}=>${nodeId}`,
      source,
      target: nodeId,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: JourneyUiEdgeType.JourneyUiDefinitionEdgeProps,
        disableMarker: true,
      },
    },
    {
      id: `${nodeId}=>${leftId}`,
      source: nodeId,
      target: leftId,
      type: "placeholder",
      sourceHandle: "bottom",
      data: {
        type: JourneyUiEdgeType.JourneyUiPlaceholderEdgeProps,
      },
    },
    {
      id: `${nodeId}=>${rightId}`,
      source: nodeId,
      target: rightId,
      type: "placeholder",
      sourceHandle: "bottom",
      data: {
        type: JourneyUiEdgeType.JourneyUiPlaceholderEdgeProps,
      },
    },
    {
      id: `${leftId}=>${emptyId}`,
      source: leftId,
      target: emptyId,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: JourneyUiEdgeType.JourneyUiDefinitionEdgeProps,
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
        type: JourneyUiEdgeType.JourneyUiDefinitionEdgeProps,
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
        type: JourneyUiEdgeType.JourneyUiDefinitionEdgeProps,
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
  source?: string;
  target: string;
  leftId?: string;
  rightId?: string;
  emptyId?: string;
}): Edge<JourneyUiEdgeProps>[] {
  if (
    type === JourneyNodeType.SegmentSplitNode ||
    type === JourneyNodeType.WaitForNode
  ) {
    if (!leftId || !rightId || !emptyId) {
      throw new Error("Missing dual node ids");
    }
    if (!source) {
      throw new Error("Missing source");
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
    type === JourneyNodeType.ExitNode
  ) {
    throw new Error(`Unimplemented node type ${type}`);
  }

  const edges: Edge<JourneyUiEdgeProps>[] = [];
  if (source) {
    edges.push({
      id: `${source}=>${nodeId}`,
      source,
      target: nodeId,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: JourneyUiEdgeType.JourneyUiDefinitionEdgeProps,
      },
    });
  }
  if (target) {
    edges.push({
      id: `${nodeId}=>${target}`,
      source: nodeId,
      target,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: JourneyUiEdgeType.JourneyUiDefinitionEdgeProps,
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
  existingNodes: Node<JourneyNodeUiProps>[];
  existingEdges: Edge<JourneyUiEdgeProps>[];
}): {
  edges: Edge<JourneyUiEdgeProps>[];
  nodes: Node<JourneyNodeUiProps>[];
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

function buildLabelNode(id: string, title: string): Node<JourneyNodeUiProps> {
  return {
    id,
    position: placeholderNodePosition,
    type: "label",
    data: {
      type: JourneyUiNodeType.JourneyUiNodeLabelProps,
      title,
    },
  };
}

function buildEmptyNode(id: string): Node<JourneyNodeUiProps> {
  return {
    id,
    position: placeholderNodePosition,
    type: "empty",
    data: {
      type: JourneyUiNodeType.JourneyUiNodeEmptyProps,
    },
  };
}

function buildWorkflowEdge(
  source: string,
  target: string,
): Edge<JourneyUiEdgeProps> {
  return {
    id: `${source}=>${target}`,
    source,
    target,
    type: "workflow",
    sourceHandle: "bottom",
    data: {
      type: JourneyUiEdgeType.JourneyUiDefinitionEdgeProps,
      disableMarker: true,
    },
  };
}

function buildPlaceholderEdge(
  source: string,
  target: string,
): Edge<JourneyUiEdgeProps> {
  return {
    id: `${source}=>${target}`,
    source,
    target,
    type: "placeholder",
    sourceHandle: "bottom",
    data: {
      type: JourneyUiEdgeType.JourneyUiPlaceholderEdgeProps,
    },
  };
}

function buildJourneyNode(
  id: string,
  nodeTypeProps: JourneyUiNodeTypeProps,
): Node<JourneyUiNodeDefinitionProps> {
  return {
    id,
    position: placeholderNodePosition,
    type: "journey",
    data: {
      type: JourneyUiNodeType.JourneyUiNodeDefinitionProps,
      nodeTypeProps,
    },
  };
}

export const createJourneySlice: CreateJourneySlice = (set) => ({
  journeySelectedNodeId: null,
  journeyNodes: DEFAULT_JOURNEY_NODES,
  journeyEdges: DEFAULT_EDGES,
  journeyNodesIndex: buildNodesIndex(DEFAULT_JOURNEY_NODES),
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
  resetJourneyState: ({ nodes, edges, index }) =>
    set((state) => {
      state.journeyNodes = nodes;
      state.journeyEdges = edges;
      state.journeyNodesIndex = index;
    }),
});

export function journeyBranchToState(
  initialNodeId: string,
  nodesState: Node<JourneyNodeUiProps>[],
  edgesState: Edge<JourneyUiEdgeProps>[],
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
        const entryNode: EntryUiNodeProps = {
          type: AdditionalJourneyNodeType.EntryUiNode,
          variant: {
            type: JourneyNodeType.SegmentEntryNode,
            segment: node.segment,
          },
        };
        nodesState.push(
          buildJourneyNode(AdditionalJourneyNodeType.EntryUiNode, entryNode),
        );
        edgesState.push(
          buildWorkflowEdge(AdditionalJourneyNodeType.EntryUiNode, node.child),
        );
        nextNodeId = node.child;
        break;
      }
      case JourneyNodeType.EventEntryNode: {
        const entryNode: EntryUiNodeProps = {
          type: AdditionalJourneyNodeType.EntryUiNode,
          variant: {
            type: JourneyNodeType.EventEntryNode,
            event: node.event,
          },
        };
        nodesState.push(
          buildJourneyNode(AdditionalJourneyNodeType.EntryUiNode, entryNode),
        );
        edgesState.push(
          buildWorkflowEdge(AdditionalJourneyNodeType.EntryUiNode, node.child),
        );
        nextNodeId = node.child;
        break;
      }
      case JourneyNodeType.ExitNode: {
        const exitNode: ExitUiNodeProps = {
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
        let variant: DelayUiNodeVariant;
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

        const delayNode: DelayUiNodeProps = {
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
        const baseMessageNode: BaseMessageUiNodeProps = {
          type: JourneyNodeType.MessageNode,
          templateId: node.variant.templateId,
          name: node.name ?? "",
          subscriptionGroupId: node.subscriptionGroupId,
          syncProperties: node.syncProperties,
        };

        let messageNode: MessageUiNodeProps;
        switch (node.variant.type) {
          case ChannelType.Email: {
            messageNode = {
              ...baseMessageNode,
              channel: ChannelType.Email,
              providerOverride: node.variant.providerOverride,
            };
            break;
          }
          case ChannelType.Sms: {
            messageNode = {
              ...baseMessageNode,
              channel: ChannelType.Sms,
              providerOverride: node.variant.providerOverride,
            };
            break;
          }
          case ChannelType.Webhook: {
            messageNode = {
              ...baseMessageNode,
              channel: ChannelType.Webhook,
            };
            break;
          }
          case ChannelType.MobilePush: {
            messageNode = {
              ...baseMessageNode,
              channel: ChannelType.MobilePush,
              providerOverride: node.variant.providerOverride,
            };
            break;
          }
          default:
            assertUnreachable(node.variant);
        }

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

        const segmentSplitNode: SegmentSplitUiNodeProps = {
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
        const waitForNodeProps: WaitForUiNodeProps = {
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

export type JourneyResourceWithDefinitionForState = Pick<
  JourneyResource,
  "name"
> & { definition: JourneyDefinition };

export function journeyToState(
  journey: JourneyResourceWithDefinitionForState,
): JourneyStateForResource {
  const journeyEdges: Edge<JourneyUiEdgeProps>[] = [];
  let journeyNodes: Node<JourneyNodeUiProps>[] = [];
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

export type JourneyStateForDraft = Pick<
  JourneyState,
  "journeyNodes" | "journeyEdges"
>;

export function journeyStateToDraft(state: JourneyStateForDraft): JourneyDraft {
  return {
    nodes: state.journeyNodes.map((n) => ({
      id: n.id,
      data: n.data,
    })),
    edges: state.journeyEdges.map((e) => {
      if (!e.data) {
        throw new Error(`edge data should exist for edge ${e.id}`);
      }
      return {
        source: e.source,
        target: e.target,
        data: e.data,
      };
    }),
  };
}

export type CreateConnectionsEntryNodeParams = EntryUiNodeProps & {
  id: string;
  target: string;
};

export type CreateConnectionsExitNodeParams = ExitUiNodeProps & {
  id: string;
};

export type CreateConnectionsBodyNodeParams = JourneyUiBodyNodeTypeProps & {
  id: string;
  source: string;
  target: string;
};

export type CreateConnectionsParams =
  | CreateConnectionsEntryNodeParams
  | CreateConnectionsExitNodeParams
  | CreateConnectionsBodyNodeParams;

function buildBaseJourneyNode({
  nodeTypeProps,
  id,
}: {
  id: string;
  nodeTypeProps: JourneyUiNodeTypeProps;
}): Node<JourneyUiNodeDefinitionProps> {
  return {
    id,
    data: {
      type: JourneyUiNodeType.JourneyUiNodeDefinitionProps,
      nodeTypeProps,
    },
    position: { x: 0, y: 0 }, // no need to pass a position as it is computed by the layout hook
    type: "journey",
  };
}

export function createConnections(params: CreateConnectionsParams): {
  newNodes: Node<JourneyNodeUiProps>[];
  newEdges: Edge<JourneyUiEdgeProps>[];
} {
  let newNodes: Node<JourneyNodeUiProps>[] = [];
  let newEdges: Edge<JourneyUiEdgeProps>[];

  switch (params.type) {
    case JourneyNodeType.SegmentSplitNode: {
      const { trueLabelNodeId, falseLabelNodeId } = params;
      const { target, source } = params;
      const emptyId = uuid();

      newNodes = newNodes.concat([
        buildBaseJourneyNode({
          id: params.id,
          nodeTypeProps: omit(params, ["id", "source", "target"]),
        }),
        ...dualNodeNonJourneyNodes({
          emptyId,
          leftId: trueLabelNodeId,
          rightId: falseLabelNodeId,
          leftLabel: "true",
          rightLabel: "false",
        }),
      ]);

      newEdges = edgesForJourneyNode({
        type: params.type,
        nodeId: params.id,
        emptyId,
        leftId: trueLabelNodeId,
        rightId: falseLabelNodeId,
        source,
        target,
      });
      break;
    }
    case JourneyNodeType.WaitForNode: {
      const segmentChild = params.segmentChildren[0];
      if (!segmentChild) {
        throw new Error("Malformed journey, WaitForNode has no children.");
      }

      const segmentChildLabelNodeId = segmentChild.labelNodeId;
      const { timeoutLabelNodeId } = params;
      const emptyId = uuid();

      newNodes = [
        ...newNodes.concat(
          buildBaseJourneyNode({
            id: params.id,
            nodeTypeProps: omit(params, ["id", "source", "target"]),
          }),
          dualNodeNonJourneyNodes({
            emptyId,
            leftId: segmentChildLabelNodeId,
            rightId: timeoutLabelNodeId,
            leftLabel: WAIT_FOR_SATISFY_LABEL,
            rightLabel: waitForTimeoutLabel(params.timeoutSeconds),
          }),
        ),
      ];

      newEdges = edgesForJourneyNode({
        type: params.type,
        nodeId: params.id,
        emptyId,
        leftId: segmentChildLabelNodeId,
        rightId: timeoutLabelNodeId,
        source: params.source,
        target: params.target,
      });
      break;
    }
    case JourneyNodeType.DelayNode: {
      newNodes.push(
        buildBaseJourneyNode({
          id: params.id,
          nodeTypeProps: omit(params, ["id", "source", "target"]),
        }),
      );
      newEdges = edgesForJourneyNode({
        type: params.type,
        nodeId: params.id,
        source: params.source,
        target: params.target,
      });
      break;
    }
    case JourneyNodeType.MessageNode: {
      newNodes.push(
        buildBaseJourneyNode({
          id: params.id,
          nodeTypeProps: omit(params, ["id", "source", "target"]),
        }),
      );
      newEdges = edgesForJourneyNode({
        type: params.type,
        nodeId: params.id,
        source: params.source,
        target: params.target,
      });
      break;
    }
    case AdditionalJourneyNodeType.EntryUiNode: {
      throw new Error("Cannot add exit node in the UI implementation error.");
    }
    case JourneyNodeType.ExitNode: {
      throw new Error("Cannot add exit node in the UI implementation error.");
    }
    default:
      assertUnreachable(params);
  }

  return {
    newNodes,
    newEdges,
  };
}

export type JourneyResourceWithDraftForState = Pick<JourneyResource, "name"> & {
  draft: JourneyDraft;
};

export function journeyDraftToState({
  draft,
  name,
}: JourneyResourceWithDraftForState): JourneyStateForResource {
  let journeyNodes: Node<JourneyNodeUiProps>[] = draft.nodes.map((n) => {
    let node: Node<JourneyNodeUiProps>;
    switch (n.data.type) {
      case JourneyUiNodeType.JourneyUiNodeDefinitionProps:
        node = buildJourneyNode(n.id, n.data.nodeTypeProps);
        break;
      case JourneyUiNodeType.JourneyUiNodeLabelProps:
        node = buildLabelNode(n.id, n.data.title);
        break;
      case JourneyUiNodeType.JourneyUiNodeEmptyProps:
        node = buildEmptyNode(n.id);
        break;
      default:
        assertUnreachable(n.data);
    }
    return node;
  });
  const journeyEdges: Edge<JourneyUiEdgeProps>[] = draft.edges.map((e) => {
    const { source, target, data } = e;
    const baseEdge = {
      id: `${source}=>${target}`,
      source,
      target,
      sourceHandle: "bottom",
    };
    let edge: Edge<JourneyUiEdgeProps>;
    switch (data.type) {
      case JourneyUiEdgeType.JourneyUiDefinitionEdgeProps: {
        edge = {
          ...baseEdge,
          type: "workflow",
          data,
        };
        break;
      }
      case JourneyUiEdgeType.JourneyUiPlaceholderEdgeProps: {
        edge = {
          ...baseEdge,
          type: "placeholder",
          data,
        };
        break;
      }
    }
    return edge;
  });

  journeyNodes = layoutNodes(journeyNodes, journeyEdges);
  return {
    journeyName: name,
    journeyNodes,
    journeyEdges,
    journeyNodesIndex: buildNodesIndex(journeyNodes),
  };
}

/**
 * update journey draft if one of the following
 * 1. journey state does equal draft
 * 2. journey draft is undefined, current state does not equal the definition
 *
 * @param param0
 * @returns
 */
export function shouldDraftBeUpdated({
  draft,
  definition,
  journeyNodes,
  journeyEdges,
  journeyNodesIndex,
}: {
  draft?: JourneyDraft;
  definition?: JourneyDefinition;
  journeyNodes: Node<JourneyNodeUiProps>[];
  journeyEdges: Edge<JourneyUiEdgeProps>[];
  journeyNodesIndex: JourneyState["journeyNodesIndex"];
}): boolean {
  if (draft) {
    return !deepEquals(
      journeyStateToDraft({
        journeyNodes,
        journeyEdges,
      }),
      draft,
    );
  }
  if (!definition) {
    throw new Error("definition should exist if draft is undefined");
  }
  const draftFromStateResult = journeyDefinitionFromState({
    state: {
      journeyNodes,
      journeyEdges,
      journeyNodesIndex,
    },
  });
  if (draftFromStateResult.isErr()) {
    return true;
  }

  return !deepEquals(draftFromStateResult.value, definition);
}
