import { idxUnsafe } from "isomorphic-lib/src/arrays";
import {
  buildHeritageMap,
  getNearestFromChildren,
  getNearestFromParents,
  getNodeId,
  HeritageMap,
  isMultiChildNode,
  removeNode,
} from "isomorphic-lib/src/journeys";
import { getUnsafe } from "isomorphic-lib/src/maps";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  CompletionStatus,
  DelayNode,
  DelayVariantType,
  EntryNode,
  ExitNode,
  JourneyDefinition,
  JourneyNode,
  JourneyNodeType,
  JourneyResource,
  MessageNode,
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

export type JourneyStateForResource = Pick<
  JourneyState,
  "journeyNodes" | "journeyEdges" | "journeyNodesIndex" | "journeyName"
>;

export function findDirectUiParents(
  parentId: string,
  edges: JourneyContent["journeyEdges"]
): string[] {
  return edges.flatMap((e) => (e.target === parentId ? e.source : []));
}

export function findDirectUiChildren(
  parentId: string,
  edges: JourneyContent["journeyEdges"]
): string[] {
  return edges.flatMap((e) => (e.source === parentId ? e.target : []));
}

export const WAIT_FOR_SATISFY_LABEL = "In segment";

export function waitForTimeoutLabel(timeoutSeconds?: number): string {
  return `Timed out after ${durationDescription(timeoutSeconds)}`;
}

function multiMapSet<P, C, M extends Map<C, P[]>>(
  parent: P,
  childId: C,
  map: M
) {
  let existing = map.get(childId);
  if (!existing) {
    existing = [];
    map.set(childId, existing);
  }
  existing.push(parent);
}

function buildUiHeritageMap(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
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
      (childId) => nodes.find((n) => n.id === childId) ?? []
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
        map.get(childId)?.children.values() ?? []
      ).flatMap(
        (grandChildId) => nodes.find((n) => n.id === grandChildId) ?? []
      );

      queue.push(...grandchildren);
    }
  }

  return map;
}

export function getNearestJourneyFromChildren(
  nId: string,
  hm: HeritageMap,
  uiJourneyNodes: Map<string, NodeTypeProps>
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
    (val) => val[1]
  );
  const nearestDescendant = nearestDescendants[0];
  if (!nearestDescendant) {
    throw new Error(`Missing nearest for ${nId}`);
  }
  return nearestDescendant[0];
}

function journeyDefinitionFromStateBranch(
  initialNodeId: string,
  hm: HeritageMap,
  nodes: JourneyNode[],
  uiJourneyNodes: Map<string, NodeTypeProps>,
  edges: Edge<EdgeData>[],
  terminateBefore?: string
): Result<null, { message: string; nodeId: string }> {
  let hmEntry = getUnsafe(hm, initialNodeId);
  let nId = initialNodeId;
  let nextId: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    const uiNode = getUnsafe(uiJourneyNodes, nId);

    switch (uiNode.type) {
      case JourneyNodeType.EntryNode: {
        if (!uiNode.segmentId) {
          return err({
            message: "Entry node must have a segment",
            nodeId: nId,
          });
        }

        const child = idxUnsafe(findDirectUiChildren(nId, edges), 0);
        const node: EntryNode = {
          type: JourneyNodeType.EntryNode,
          segment: uiNode.segmentId,
          child,
        };
        nodes.push(node);
        nextId = child;
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

        const child = idxUnsafe(findDirectUiChildren(nId, edges), 0);
        const node: MessageNode = {
          id: nId,
          type: JourneyNodeType.MessageNode,
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
        if (!uiNode.seconds) {
          return err({
            message: "Delay node must have a timeout",
            nodeId: nId,
          });
        }
        const child = idxUnsafe(findDirectUiChildren(nId, edges), 0);
        const node: DelayNode = {
          type: JourneyNodeType.DelayNode,
          id: nId,
          variant: {
            type: DelayVariantType.Second,
            seconds: uiNode.seconds,
          },
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
        const timeoutChild = idxUnsafe(
          findDirectUiChildren(uiNode.timeoutLabelNodeId, edges),
          0
        );

        if (nfc !== timeoutChild) {
          const branchResult = journeyDefinitionFromStateBranch(
            timeoutChild,
            hm,
            nodes,
            uiJourneyNodes,
            edges,
            nfc
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
          const child = idxUnsafe(
            findDirectUiChildren(segmentChild.labelNodeId, edges),
            0
          );
          if (nfc !== child) {
            const branchResult = journeyDefinitionFromStateBranch(
              child,
              hm,
              nodes,
              uiJourneyNodes,
              edges,
              nfc
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
        const trueChild = idxUnsafe(
          findDirectUiChildren(uiNode.trueLabelNodeId, edges),
          0
        );

        const nfc = getNearestJourneyFromChildren(nId, hm, uiJourneyNodes);
        if (nfc !== trueChild) {
          const branchResult = journeyDefinitionFromStateBranch(
            trueChild,
            hm,
            nodes,
            uiJourneyNodes,
            edges,
            nfc
          );
          if (branchResult.isErr()) {
            return err(branchResult.error);
          }
        }

        const falseChild = idxUnsafe(
          findDirectUiChildren(uiNode.falseLabelNodeId, edges),
          0
        );
        if (nfc !== falseChild) {
          const branchResult = journeyDefinitionFromStateBranch(
            falseChild,
            hm,
            nodes,
            uiJourneyNodes,
            edges,
            nfc
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
  }
  return ok(null);
}

export function journeyDefinitionFromStateV2({
  state,
}: {
  state: Omit<JourneyStateForResource, "journeyName">;
}): Result<JourneyDefinition, { message: string; nodeId: string }> {
  const nodes: JourneyNode[] = [];
  const journeyNodes = state.journeyNodes.reduce((acc, node) => {
    if (node.data.type === "JourneyNode") {
      acc.set(node.id, node.data.nodeTypeProps);
    }
    return acc;
  }, new Map<string, NodeTypeProps>());
  const hm = buildUiHeritageMap(state.journeyNodes, state.journeyEdges);

  throw new Error("Not implemented");
}

export function journeyDefinitionFromState({
  state,
}: {
  state: Omit<JourneyStateForResource, "journeyName">;
}): Result<JourneyDefinition, { message: string; nodeId: string }> {
  // parent, child
  const edgeIndex = new Map<string, string[]>();
  for (const edge of state.journeyEdges) {
    multiMapSet(edge.target, edge.source, edgeIndex);
  }

  const entryNode = findNode(
    JourneyNodeType.EntryNode,
    state.journeyNodes,
    state.journeyNodesIndex
  );

  if (
    !entryNode ||
    entryNode.data.type !== "JourneyNode" ||
    entryNode.data.nodeTypeProps.type !== JourneyNodeType.EntryNode
  ) {
    throw new Error("Entry node is missing or malformed");
  }

  if (!entryNode.data.nodeTypeProps.segmentId) {
    return err({
      message: "Entry node must include a segment id.",
      nodeId: entryNode.id,
    });
  }

  const edges = edgeIndex.get(entryNode.id);
  if (!edges?.[0]) {
    throw new Error("Edge is missing or malformed");
  }

  const entryNodeResource: EntryNode = {
    type: JourneyNodeType.EntryNode,
    segment: entryNode.data.nodeTypeProps.segmentId,
    child: edges[0],
  };
  let exitNodeResource: ExitNode | null = null;
  const nodeResources: JourneyDefinition["nodes"] = [];
  const visited = new Set<string>();
  const entryChildId = edgeIndex.get(entryNode.id)?.at(0);
  if (!entryChildId) {
    throw new Error("Unable to find entry child id");
  }
  const entryChild = findNode(
    entryChildId,
    state.journeyNodes,
    state.journeyNodesIndex
  );
  if (!entryChild) {
    throw new Error("Unable to find entry child");
  }
  const stack: Node<NodeData>[] = [entryChild];

  function traverseUntilJourneyNode(start: string): Node<NodeData> | null {
    let currentId = start;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
      const node = findNode(
        currentId,
        state.journeyNodes,
        state.journeyNodesIndex
      );
      if (!node) {
        return null;
      }

      if (node.data.type === "JourneyNode") {
        return node;
      }

      const edgesToTraverse = edgeIndex.get(currentId);
      if (!edgesToTraverse) {
        return null;
      }

      const edge = edgesToTraverse[0];
      if (!edge) {
        return null;
      }

      currentId = edge;
    }
  }

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current) {
      throw new Error("Tried to pop empty journey node stack.");
    }

    if (current.type !== "journey" || current.data.type !== "JourneyNode") {
      throw new Error("Journey node stack contains a non journey node. ");
    }

    if (visited.has(current.id)) {
      continue;
    }

    visited.add(current.id);
    const props = current.data.nodeTypeProps;

    if (props.type === JourneyNodeType.SegmentSplitNode) {
      const trueNode = traverseUntilJourneyNode(props.trueLabelNodeId);
      const falseNode = traverseUntilJourneyNode(props.falseLabelNodeId);

      if (!trueNode || !falseNode) {
        throw new Error("Can't find true and false nodes for segment split.");
      }

      if (!props.segmentId) {
        return err({
          message: "Segment split node is missing an assigned segment",
          nodeId: current.id,
        });
      }

      const newNodeResource: SegmentSplitNode = {
        id: current.id,
        type: JourneyNodeType.SegmentSplitNode,
        variant: {
          type: SegmentSplitVariantType.Boolean,
          segment: props.segmentId,
          trueChild: trueNode.id,
          falseChild: falseNode.id,
        },
      };
      nodeResources.push(newNodeResource);

      stack.push(trueNode);
      stack.push(falseNode);
      continue;
    }

    if (props.type === JourneyNodeType.WaitForNode) {
      const segmentChild = props.segmentChildren[0];
      if (!segmentChild) {
        return err({
          message: "Wait for node is missing a segment child",
          nodeId: current.id,
        });
      }
      const segmentNode = traverseUntilJourneyNode(segmentChild.labelNodeId);
      const timeoutNode = traverseUntilJourneyNode(props.timeoutLabelNodeId);

      if (!segmentNode || !timeoutNode) {
        throw new Error("Can't find timeout and segment nodes");
      }

      if (!segmentChild.segmentId) {
        return err({
          message: "Wait for node segment child is missing an assigned segment",
          nodeId: current.id,
        });
      }

      if (!props.timeoutSeconds) {
        return err({
          message: "Wait for node is missing a timeout",
          nodeId: current.id,
        });
      }

      const newNodeResource: WaitForNode = {
        id: current.id,
        type: JourneyNodeType.WaitForNode,
        timeoutChild: timeoutNode.id,
        timeoutSeconds: props.timeoutSeconds,
        segmentChildren: [
          {
            id: segmentNode.id,
            segmentId: segmentChild.segmentId,
          },
        ],
      };

      nodeResources.push(newNodeResource);

      stack.push(segmentNode);
      stack.push(timeoutNode);
      continue;
    }

    if (props.type === JourneyNodeType.ExitNode) {
      exitNodeResource = {
        type: JourneyNodeType.ExitNode,
      };
      continue;
    }

    const nextNodeId = edgeIndex.get(current.id)?.at(0);
    const nextNode = nextNodeId ? traverseUntilJourneyNode(nextNodeId) : null;

    if (!nextNode) {
      throw new Error(
        `Malformed node. Only exit nodes lack children. ${current.id}`
      );
    }

    stack.push(nextNode);

    let newNodeResource: JourneyNode;
    switch (props.type) {
      case JourneyNodeType.DelayNode: {
        if (!props.seconds) {
          return err({
            message: "Delay node is missing duration.",
            nodeId: current.id,
          });
        }

        const delayNode: DelayNode = {
          id: current.id,
          type: JourneyNodeType.DelayNode,
          child: nextNode.id,
          variant: {
            type: DelayVariantType.Second,
            seconds: props.seconds,
          },
        };
        newNodeResource = delayNode;
        break;
      }
      case JourneyNodeType.MessageNode: {
        if (!props.templateId) {
          return err({
            message: "Message node is missing template.",
            nodeId: current.id,
          });
        }
        const messageNode: MessageNode = {
          id: current.id,
          type: JourneyNodeType.MessageNode,
          child: nextNode.id,
          name: props.name,
          subscriptionGroupId: props.subscriptionGroupId,
          variant: {
            type: props.channel,
            templateId: props.templateId,
          },
        };
        newNodeResource = messageNode;
        break;
      }
      case JourneyNodeType.EntryNode: {
        throw new Error("Entry node should already be handled");
      }
    }

    nodeResources.push(newNodeResource);
  }

  if (!exitNodeResource) {
    throw new Error("Malformed journey, missing exit node.");
  }

  const definition: JourneyDefinition = {
    entryNode: entryNodeResource,
    exitNode: exitNodeResource,
    nodes: nodeResources,
  };

  return ok(definition);
}

interface StateFromJourneyNode {
  journeyNode: Node<JourneyNodeProps>;
  nonJourneyNodes: Node<NonJourneyNodeData>[];
  edges: Edge<EdgeData>[];
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
    type === JourneyNodeType.EntryNode ||
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

export function journeyNodeToState(
  node: JourneyNode,
  source: string,
  target: string
): StateFromJourneyNode {
  if (
    node.type === JourneyNodeType.EntryNode ||
    node.type === JourneyNodeType.ExitNode
  ) {
    throw new Error("Entry and exit nodes should not be converted to state.");
  }

  let nodeTypeProps: NodeTypeProps;
  let nonJourneyNodes: Node<NonJourneyNodeData>[] = [];
  let edges: Edge<EdgeData>[] = [];

  switch (node.type) {
    case JourneyNodeType.DelayNode:
      edges = edges.concat(
        edgesForJourneyNode({
          type: node.type,
          nodeId: node.id,
          source,
          target,
        })
      );

      nodeTypeProps = {
        type: JourneyNodeType.DelayNode,
        seconds: node.variant.seconds,
      };
      break;
    case JourneyNodeType.MessageNode:
      edges = edges.concat(
        edgesForJourneyNode({
          type: node.type,
          nodeId: node.id,
          source,
          target,
        })
      );

      nodeTypeProps = {
        type: JourneyNodeType.MessageNode,
        channel: node.variant.type,
        name: node.name ?? "",
        templateId: node.variant.templateId,
        subscriptionGroupId: node.subscriptionGroupId,
      };
      break;
    case JourneyNodeType.SegmentSplitNode: {
      const trueId = `${node.id}-child-0`;
      const falseId = `${node.id}-child-1`;
      const emptyId = `${node.id}-empty`;

      nonJourneyNodes = nonJourneyNodes.concat(
        dualNodeNonJourneyNodes({
          emptyId,
          leftId: trueId,
          rightId: falseId,
          leftLabel: "true",
          rightLabel: "false",
        })
      );

      edges = edges.concat(
        edgesForJourneyNode({
          type: node.type,
          nodeId: node.id,
          emptyId,
          leftId: trueId,
          rightId: falseId,
          source,
          target,
        })
      );

      nodeTypeProps = {
        type: JourneyNodeType.SegmentSplitNode,
        name: node.name ?? "",
        segmentId: node.variant.segment,
        trueLabelNodeId: trueId,
        falseLabelNodeId: falseId,
      };
      break;
    }
    case JourneyNodeType.WaitForNode: {
      const emptyId = `${node.id}-empty`;
      const segmentChild = node.segmentChildren[0];
      if (!segmentChild) {
        throw new Error("Malformed journey, WaitForNode has no children.");
      }

      const segmentChildLabelNodeId = `${node.id}-child-0`;
      const timeoutLabelNodeId = `${node.id}-child-1`;

      nonJourneyNodes = nonJourneyNodes.concat(
        dualNodeNonJourneyNodes({
          emptyId,
          leftId: segmentChildLabelNodeId,
          rightId: timeoutLabelNodeId,
          leftLabel: WAIT_FOR_SATISFY_LABEL,
          rightLabel: waitForTimeoutLabel(node.timeoutSeconds),
        })
      );

      edges = edges.concat(
        edgesForJourneyNode({
          type: node.type,
          nodeId: node.id,
          emptyId,
          leftId: segmentChildLabelNodeId,
          rightId: timeoutLabelNodeId,
          source,
          target,
        })
      );

      nodeTypeProps = {
        type: JourneyNodeType.WaitForNode,
        timeoutLabelNodeId,
        timeoutSeconds: node.timeoutSeconds,
        segmentChildren: [
          {
            labelNodeId: segmentChildLabelNodeId,
            segmentId: segmentChild.segmentId,
          },
        ],
      };
      break;
    }
    case JourneyNodeType.ExperimentSplitNode:
      throw new Error("Unimplemented node type");
    case JourneyNodeType.RateLimitNode:
      throw new Error("Unimplemented node type");
  }

  const journeyNode: Node<JourneyNodeProps> = {
    id: node.id,
    position: placeholderNodePosition,
    type: "journey",
    data: {
      type: "JourneyNode",
      nodeTypeProps,
    },
  };

  return {
    journeyNode,
    nonJourneyNodes,
    edges,
  };
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
 * Removes replaced and isolated nodes/edges from journey.
 * @param nodes
 * @param edges
 * @returns list of nodes and edges to remove.
 */
function removeParts(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): { edges: string[]; nodes: string[] } {
  const childEdges = new Map<string, Edge<EdgeData>[]>();
  const childEmptyEdges = new Map<string, Edge<EdgeData>[]>();

  const nodeMap = nodes.reduce<Map<string, Node<NodeData>>>(
    (acc, node) => acc.set(node.id, node),
    new Map()
  );

  for (const e of edges) {
    const sourceNode = nodeMap.get(e.source);
    const targetNode = nodeMap.get(e.target);

    if (!sourceNode || !targetNode || sourceNode.type !== "label") {
      continue;
    }
    if (targetNode.type === "empty") {
      if (!childEmptyEdges.has(e.source)) {
        childEmptyEdges.set(e.source, []);
      }
      childEmptyEdges.get(e.source)?.push(e);
    } else {
      if (!childEdges.has(e.source)) {
        childEdges.set(e.source, []);
      }
      childEdges.get(e.source)?.push(e);
    }
  }

  const edgesResult = new Set<string>();
  const nodesResult = new Set<string>();

  childEmptyEdges.forEach((cee, source) => {
    if (childEdges.get(source)?.length) {
      cee.forEach((edge) => edgesResult.add(edge.id));
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    let removed = false;
    for (const edge of edges) {
      if (edgesResult.has(edge.id)) {
        continue;
      }
      if (
        !nodeMap.has(edge.target) ||
        !nodeMap.has(edge.source) ||
        nodesResult.has(edge.target) ||
        nodesResult.has(edge.source)
      ) {
        edgesResult.add(edge.id);
        removed = true;
      }
    }

    const filteredEdges = edges.filter((e) => !edgesResult.has(e.id));

    for (const node of nodes) {
      if (
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        node.id === JourneyNodeType.EntryNode ||
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        node.id === JourneyNodeType.ExitNode
      ) {
        continue;
      }
      if (node.type === "journey") {
        continue;
      }
      if (nodesResult.has(node.id)) {
        continue;
      }

      const children = findDirectUiChildren(node.id, filteredEdges);
      const parents = findDirectUiParents(node.id, filteredEdges);

      if (!children.length || !parents.length) {
        nodesResult.add(node.id);
        removed = true;
      }
    }
    if (!removed) {
      break;
    }
  }

  return {
    edges: Array.from(edgesResult),
    nodes: Array.from(nodesResult),
  };
}

function findSourceFromNearest(
  nId: string,
  hm: HeritageMap,
  nearest: string | null,
  nodes: Map<string, Node<NodeData>>
): string {
  const hmEntry = getUnsafe(hm, nId);
  let source: string;

  if (nearest) {
    source = `${nearest}-empty`;

    if (nId === "segment-split-3") {
      console.log(
        "bad target 4",
        JSON.stringify(
          {
            source,
          },
          null,
          2
        )
      );
    }
  } else {
    const parents = Array.from(hmEntry.parents);
    if (!parents[0]) {
      throw new Error(`Missing source for ${nId}`);
    }
    const parentNode = getUnsafe(nodes, parents[0]);
    const parentHmEntry = getUnsafe(hm, parents[0]);

    // const nonExitChildren = Array.from(parentHmEntry.children).filter(
    //   // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    //   (c) => c !== JourneyNodeType.ExitNode
    // ).length;

    if (
      parentNode.data.type === "JourneyNode" &&
      isMultiChildNode(parentNode.data.nodeTypeProps.type) &&
      // FIXME not hitting this condition because of exit node
      parentHmEntry.children.size === 1
    ) {
      source = `${parents[0]}-empty`;

      // FIXME should be hitting this case
      if (nId === "segment-split-3") {
        // console.log(
        //   "bad target 5",
        //   JSON.stringify(
        //     {
        //       source,
        //     },
        //     null,
        //     2
        //   )
        // );
      }
    } else if (parentHmEntry.children.size > 1) {
      // README: relies on the ordering of findDirectChildren method
      const index = Array.from(parentHmEntry.children).indexOf(nId);
      source = `${parents[0]}-child-${index}`;

      // FIXME this case
      if (nId === "segment-split-3") {
        // console.log(
        //   "bad target 6",
        //   JSON.stringify(
        //     {
        //       parent: parents[0],
        //       source,
        //     },
        //     null,
        //     2
        //   )
        // );
      }
    } else {
      [source] = parents;

      if (nId === "segment-split-3") {
        // console.log(
        //   "bad target 7",
        //   JSON.stringify(
        //     {
        //       source,
        //     },
        //     null,
        //     2
        //   )
        // );
      }
    }
  }
  return source;
}

function findSource(
  nId: string,
  hm: HeritageMap,
  // FIXME use definition nodema
  nodes: Map<string, Node<NodeData>>
): string {
  const nearest = getNearestFromParents(nId, hm);
  return findSourceFromNearest(nId, hm, nearest, nodes);
}

function findTarget(
  nId: string,
  hm: HeritageMap,
  nodes: Map<string, JourneyNode>
): string {
  const hmEntry = getUnsafe(hm, nId);

  return "";
  // const nearestFromChildren = getNearestFromChildren(nId, hm);

  // const children = Array.from(hmEntry.children);
  // if (!children[0]) {
  //   throw new Error(`Missing source for ${nId}`);
  // }
  // const nfmChildrenDefault = nearestFromChildren ?? children[0];
  // const nearestFromParents = getNearestFromParents(nfmChildrenDefault, hm);

  // if (!nearestFromParents) {
  //   return nfmChildrenDefault;
  // }

  // const nfmpHmEntry = getUnsafe(hm, nearestFromParents);
  // const connectsToParentEmpty =
  //   nId !== nearestFromParents && nfmpHmEntry.descendants.has(nId);

  // if (!connectsToParentEmpty) {
  //   return nfmChildrenDefault;
  // }

  // // Lowest ancestor they share a child with
  // // FIXME not right
  // const lowestSharedAncestor = sortBy(
  //   Array.from(hmEntry.ancestors).flatMap((a) => {
  //     const ancestorHmEntry = getUnsafe(hm, a);
  //     const ancestorNode = getUnsafe(nodes, a);
  //     if (!isMultiChildNode(ancestorNode.type)) {
  //       return [];
  //     }
  //     const val: [string, number] = [a, -ancestorHmEntry.ancestors.size];
  //     return [val];
  //   }),
  //   (val) => val[1]
  // )[0];

  // if (!lowestSharedAncestor) {
  //   throw new Error(`Missing highestSharedAncestor for ${nId}`);
  // }

  // if (nId === "wait-for-onboarding-2") {
  //   console.log(
  //     "bad target 1",
  //     JSON.stringify(
  //       {
  //         nId,
  //         nearestFromChildren,
  //         nfmChildrenDefault,
  //         nearestFromParents,
  //       },
  //       null,
  //       2
  //     )
  //   );
  //   console.log("bad target 2", {
  //     hmEntry,
  //     nfmpHmEntry,
  //     highestSharedAncestor: lowestSharedAncestor,
  //     connectsToParentEmpty,
  //     target: `${lowestSharedAncestor[0]}-empty`,
  //   });
  // }
  // return `${lowestSharedAncestor[0]}-empty`;

  // if (!parents[0] || parents.length > 1) {
  //   throw new Error(`expecting exactly 1 parent for ${nId}`);
  // }
  // return `${parents[0]}-empty`;

  // // finding source of child is not right way to connect to parent empty
  // // FIXME this is the wrong strategy, passing empty to this node, but has no way of deciding which empty to select. should be connecting to parents empty
  // const target = findSourceFromNearest(
  //   nfmChildrenDefault,
  //   hm,
  //   nearestFromParents,
  //   nodes
  // );

  // if (nId === "segment-split-3") {
  //   // FIXME
  //   console.log(
  //     "bad target 3",
  //     JSON.stringify(
  //       {
  //         target,
  //       },
  //       null,
  //       2
  //     )
  //   );
  // }

  // return target;
}

export function journeyToState(
  journey: Omit<JourneyResource, "id" | "status" | "workspaceId">
): JourneyStateForResource {
  const nodeMap = [
    journey.definition.entryNode,
    ...journey.definition.nodes,
    journey.definition.exitNode,
  ].reduce((acc, n) => {
    acc.set(getNodeId(n), n);
    return acc;
  }, new Map<string, JourneyNode>());

  const jn = new Map<string, Node<NodeData>>();
  const je = new Map<string, Edge<EdgeData>>();

  const hm = buildHeritageMap(journey.definition);
  const nodes = [
    journey.definition.entryNode,
    ...journey.definition.nodes,
    journey.definition.exitNode,
  ];

  for (const n of nodes) {
    let newNodes: Node<NodeData>[];
    let newEdges: Edge<EdgeData>[];
    const nId = getNodeId(n);
    const hmEntry = hm.get(nId);
    if (!hmEntry) {
      throw new Error(`Missing heritage map entry ${nId}`);
    }

    switch (n.type) {
      case JourneyNodeType.EntryNode: {
        newNodes = [
          {
            id: JourneyNodeType.EntryNode,
            position: placeholderNodePosition,
            type: "journey",
            data: {
              type: "JourneyNode",
              nodeTypeProps: {
                type: JourneyNodeType.EntryNode,
                segmentId: n.segment,
              },
            },
          },
        ];
        newEdges = [
          {
            id: `${JourneyNodeType.EntryNode}=>${n.child}`,
            source: JourneyNodeType.EntryNode,
            target: n.child,
            type: "workflow",
            data: {
              type: "WorkflowEdge",
              disableMarker: true,
            },
          },
        ];
        break;
      }
      case JourneyNodeType.ExitNode: {
        const source = findSource(nId, hm, jn);
        newNodes = [
          {
            id: JourneyNodeType.ExitNode,
            position: placeholderNodePosition,
            type: "journey",
            data: {
              type: "JourneyNode",
              nodeTypeProps: {
                type: JourneyNodeType.ExitNode,
              },
            },
          },
        ];
        newEdges = [
          {
            id: `${source}=>${JourneyNodeType.ExitNode}`,
            source,
            target: JourneyNodeType.ExitNode,
            type: "workflow",
            data: {
              type: "WorkflowEdge",
              disableMarker: true,
            },
          },
        ];
        break;
      }
      case JourneyNodeType.MessageNode: {
        const source = findSource(nId, hm, jn);
        const target = findTarget(nId, hm, nodeMap);
        const state = journeyNodeToState(n, source, target);
        newEdges = state.edges;
        newNodes = [state.journeyNode, ...state.nonJourneyNodes];
        break;
      }
      case JourneyNodeType.DelayNode: {
        const source = findSource(nId, hm, jn);
        const target = findTarget(nId, hm, nodeMap);
        const state = journeyNodeToState(n, source, target);
        newEdges = state.edges;
        newNodes = [state.journeyNode, ...state.nonJourneyNodes];
        break;
      }
      case JourneyNodeType.SegmentSplitNode: {
        const source = findSource(nId, hm, jn);
        const target = findTarget(nId, hm, nodeMap);
        const state = journeyNodeToState(n, source, target);
        newEdges = state.edges;
        newNodes = [state.journeyNode, ...state.nonJourneyNodes];
        break;
      }
      case JourneyNodeType.WaitForNode: {
        const source = findSource(nId, hm, jn);
        const target = findTarget(nId, hm, nodeMap);
        const state = journeyNodeToState(n, source, target);
        newEdges = state.edges;
        newNodes = [state.journeyNode, ...state.nonJourneyNodes];
        break;
      }
      case JourneyNodeType.ExperimentSplitNode: {
        throw new Error("Unimplemented node type");
      }
      case JourneyNodeType.RateLimitNode: {
        throw new Error("Unimplemented node type");
      }
    }

    for (const newNode of newNodes) {
      jn.set(newNode.id, newNode);
    }
    for (const e of newEdges) {
      je.set(e.id, e);
    }
  }

  let journeyNodes = Array.from(jn.values());

  const toRemove = removeParts(journeyNodes, Array.from(je.values()));
  toRemove.edges.forEach((toDelete) => {
    je.delete(toDelete);
  });
  toRemove.nodes.forEach((toDelete) => {
    jn.delete(toDelete);
  });

  // re-set with deleted nodes
  journeyNodes = Array.from(jn.values());
  const journeyEdges = Array.from(je.values());
  journeyNodes = layoutNodes(journeyNodes, journeyEdges);
  const journeyNodesIndex = buildNodesIndex(journeyNodes);

  return {
    journeyName: journey.name,
    journeyNodes,
    journeyEdges,
    journeyNodesIndex,
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
  edges: JourneyContent["journeyEdges"]
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
  setEdges: (changes: EdgeChange[]) =>
    set((state) => {
      state.journeyEdges = applyEdgeChanges(changes, state.journeyEdges);
    }),
  deleteJourneyNode: (nodeId: string) =>
    set((state) => {
      // FIXME handle result
      const definition = unwrap(journeyDefinitionFromState({ state }));
      const newDefinition = removeNode(nodeId, definition);

      const uiState = journeyToState({
        name: state.journeyName,
        definition: newDefinition,
      });

      state.journeyNodes = uiState.journeyNodes;
      state.journeyEdges = uiState.journeyEdges;
      state.journeyNodesIndex = uiState.journeyNodesIndex;
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
        state.journeyNodesIndex
      );
      if (node) {
        updater(node);
      }
    }),
  setJourneyUpdateRequest: (request) =>
    set((state) => {
      state.journeyUpdateRequest = request;
    }),
  setJourneyName: (name) =>
    set((state) => {
      state.journeyName = name;
    }),
  updateLabelNode: (nodeId, title) =>
    set((state) => {
      const node = findNode(
        nodeId,
        state.journeyNodes,
        state.journeyNodesIndex
      );
      if (node && isLabelNode(node)) {
        node.data.title = title;
      }
    }),
});

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
  nodeTypeProps: NodeTypeProps
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

export function journeyBranchToState(
  initialNodeId: string,
  nodesState: Node<NodeData>[],
  edgesState: Edge<EdgeData>[],
  nodes: Map<string, JourneyNode>,
  hm: HeritageMap,
  terminateBefore?: string
): {
  terminalNode: string | null;
} {
  let nId: string = initialNodeId;
  let node = getUnsafe(nodes, nId);
  let nextNodeId: string | null = null;

  console.log("journeyBranchToState start", {
    nId,
  });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    console.log("node loop start", { nId });

    switch (node.type) {
      case JourneyNodeType.EntryNode: {
        const entryNode: EntryNodeProps = {
          type: JourneyNodeType.EntryNode,
          segmentId: node.segment,
        };
        nodesState.push(buildJourneyNode(nId, entryNode));
        edgesState.push(
          buildWorkflowEdge(JourneyNodeType.EntryNode, node.child)
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
        const delayNode: DelayNodeProps = {
          type: JourneyNodeType.DelayNode,
          seconds: node.variant.seconds,
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

        nodesState.push(
          buildJourneyNode(nId, {
            type: JourneyNodeType.SegmentSplitNode,
            segmentId: node.variant.segment,
            name: node.name ?? "",
            trueLabelNodeId: trueId,
            falseLabelNodeId: falseId,
          })
        );
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
            nfc
          ).terminalNode;
          if (!terminalId) {
            throw new Error(
              "segment split children terminate which should not be possible"
            );
          }
          edgesState.push(buildWorkflowEdge(terminalId, emptyId));
          console.log("true sub child branch", {
            trueId,
            terminalId,
            nId,
            nfc,
            emptyId,
          });
        }

        if (nId === "segment-split-1") {
          console.log("segment-split-1 children", {
            nfc,
            falseChild: node.variant.falseChild,
            trueChild: node.variant.trueChild,
          });
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
            nfc
          ).terminalNode;
          if (!terminalId) {
            throw new Error(
              "segment split children terminate which should not be possible"
            );
          }
          console.log("false sub child branch", {
            falseId,
            terminalId,
            falseChild: node.variant.falseChild,
            nId,
            nfc,
            emptyId,
          });
          edgesState.push(buildWorkflowEdge(terminalId, emptyId));
        }

        // default to true child because will be null if both children are equal
        nextNodeId = nfc ?? node.variant.trueChild;
        console.log("segment split node end block", {
          nextNodeId,
          nfc,
          trueChild: node.variant.trueChild,
          falseChild: node.variant.falseChild,
        });

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

        nodesState.push(
          buildJourneyNode(nId, {
            type: JourneyNodeType.WaitForNode,
            timeoutLabelNodeId: segmentChildLabelId,
            timeoutSeconds: node.timeoutSeconds,
            segmentChildren: [
              {
                segmentId: segmentChild.segmentId,
                labelNodeId: segmentChildLabelId,
              },
            ],
          })
        );
        // FIXME labels
        nodesState.push(buildLabelNode(segmentChildLabelId, "true"));
        nodesState.push(buildLabelNode(timeoutId, "false"));
        nodesState.push(buildEmptyNode(emptyId));
        edgesState.push(buildPlaceholderEdge(nId, segmentChildLabelId));
        edgesState.push(buildPlaceholderEdge(nId, timeoutId));

        const nfc = getNearestFromChildren(nId, hm);

        if (segmentChild.id === nfc || nfc === null) {
          edgesState.push(buildWorkflowEdge(segmentChildLabelId, emptyId));
        } else {
          edgesState.push(
            buildWorkflowEdge(segmentChildLabelId, segmentChild.id)
          );

          const terminalId = journeyBranchToState(
            segmentChild.id,
            nodesState,
            edgesState,
            nodes,
            hm,
            nfc
          ).terminalNode;
          if (!terminalId) {
            throw new Error(
              "segment split children terminate which should not be possible"
            );
          }
          edgesState.push(buildWorkflowEdge(terminalId, emptyId));
          console.log("true sub child branch", {
            trueId: segmentChildLabelId,
            terminalId,
            nId,
            nfc,
            emptyId,
          });
        }

        // if (nId === "segment-split-1") {
        // console.log("segment-split-1 children", {
        //   nfc,
        //   falseChild: node.variant.falseChild,
        //   trueChild: node.variant.trueChild,
        // });
        // }
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
            nfc
          ).terminalNode;
          if (!terminalId) {
            throw new Error("children terminate which should not be possible");
          }
          console.log("timeout sub child branch", {
            timeoutId,
            terminalId,
            falseChild: node.timeoutChild,
            nId,
            nfc,
            emptyId,
          });
          edgesState.push(buildWorkflowEdge(terminalId, emptyId));
        }

        // default to true child because will be null if both children are equal
        nextNodeId = nfc ?? segmentChild.id;
        console.log("wait for node end block", {
          nextNodeId,
          nId,
          nfc,
          segmentChildId: segmentChild.id,
          timoutChildId: node.timeoutChild,
        });

        if (nextNodeId === terminateBefore) {
          console.log("wait for early terminate");
          return {
            terminalNode: emptyId,
          };
        }
        edgesState.push(buildWorkflowEdge(emptyId, nextNodeId));
        break;
        // const segmentChild = node.segmentChildren[0];
        // if (!segmentChild) {
        //   throw new Error("Malformed journey, WaitForNode has no children.");
        // }
        // const timeoutId = `${nId}-child-1`;
        // const segmentChildId = `${nId}-child-0`;
        // const emptyId = `${nId}-empty`;

        // nodesState.push(buildLabelNode(segmentChildId, WAIT_FOR_SATISFY_LABEL));
        // nodesState.push(
        //   buildLabelNode(timeoutId, waitForTimeoutLabel(node.timeoutSeconds))
        // );
        // nodesState.push(buildEmptyNode(emptyId));

        // edgesState.push({
        //   id: `${nId}=>${segmentChildId}`,
        //   source: nId,
        //   target: segmentChildId,
        //   type: "placeholder",
        //   sourceHandle: "bottom",
        // });
        // edgesState.push({
        //   id: `${nId}=>${timeoutId}`,
        //   source: nId,
        //   target: timeoutId,
        //   type: "placeholder",
        //   sourceHandle: "bottom",
        // });
        // edgesState.push({
        //   id: `${segmentChildId}=>${segmentChild.id}`,
        //   source: segmentChildId,
        //   target: segmentChild.id,
        //   type: "workflow",
        //   sourceHandle: "bottom",
        //   data: {
        //     type: "WorkflowEdge",
        //     disableMarker: true,
        //   },
        // });
        // edgesState.push({
        //   id: `${timeoutId}=>${node.timeoutChild}`,
        //   source: timeoutId,
        //   target: node.timeoutChild,
        //   type: "workflow",
        //   sourceHandle: "bottom",
        //   data: {
        //     type: "WorkflowEdge",
        //     disableMarker: false,
        //   },
        // });

        // const terminalSegmentChildId = journeyBranchToState(
        //   segmentChild.id,
        //   nodesState,
        //   edgesState,
        //   nodes,
        //   hm
        // ).terminalNode;
        // const terminalTimeoutId = journeyBranchToState(
        //   node.timeoutChild,
        //   nodesState,
        //   edgesState,
        //   nodes,
        //   hm
        // ).terminalNode;
        // if (terminalSegmentChildId) {
        //   childNextNodes.push(terminalSegmentChildId);
        // }

        // if (terminalTimeoutId) {
        //   childNextNodes.push(terminalTimeoutId);
        // }

        // for (const childNextNode of childNextNodes) {
        //   edgesState.push({
        //     id: `${childNextNode}=>${emptyId}`,
        //     source: childNextNode,
        //     target: emptyId,
        //     type: "workflow",
        //     sourceHandle: "bottom",
        //     data: {
        //       type: "WorkflowEdge",
        //       disableMarker: true,
        //     },
        //   });
        // }

        // // FIXME
        // // nextNodeId = Array.from(hmEntry.children)[0] ?? null;
        // // if (!nextNodeId) {
        // //   throw new Error(
        // //     "multi child node has no children, this should not be possible"
        // //   );
        // // }
        // // edgesState.push({
        // //   id: `${emptyId}=>${nextNodeId}`,
        // //   source: emptyId,
        // //   target: nextNodeId,
        // //   type: "workflow",
        // //   sourceHandle: "bottom",
        // //   data: {
        // //     type: "WorkflowEdge",
        // //     disableMarker: true,
        // //   },
        // // });
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

export function journeyToStateV2(
  journey: Omit<JourneyResource, "id" | "status" | "workspaceId">
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
    JourneyNodeType.EntryNode,
    journeyNodes,
    journeyEdges,
    nodes,
    hm
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
