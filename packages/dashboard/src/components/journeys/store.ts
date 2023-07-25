import { getJourneyNode } from "isomorphic-lib/src/journeys";
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
import { v4 as uuid } from "uuid";
import { type immer } from "zustand/middleware/immer";

import {
  AddNodesParams,
  EdgeData,
  JourneyContent,
  JourneyNodeProps,
  JourneyState,
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

type JourneyStateForResource = Pick<
  JourneyState,
  "journeyNodes" | "journeyEdges" | "journeyNodesIndex" | "journeyName"
>;

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
      throw new Error("Malformed node. Only exit nodes lack children.");
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
  return [
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
    {
      id: `${emptyId}=>${target}`,
      source: emptyId,
      target,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: "WorkflowEdge",
        disableMarker: true,
      },
    },
  ];
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

  return [
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
    {
      id: `${nodeId}=>${target}`,
      source: nodeId,
      target,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: "WorkflowEdge",
      },
    },
  ];
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
      const trueId = `${node.id}-true`;
      const falseId = `${node.id}-false`;
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

      const segmentChildLabelNodeId = `${node.id}-segment-child`;
      const timeoutLabelNodeId = `${node.id}-timeout`;

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

export function journeyToState(
  journey: JourneyResource
): JourneyStateForResource {
  let journeyNodes: Node<NodeData>[] = [
    {
      id: JourneyNodeType.EntryNode,
      position: placeholderNodePosition,
      type: "journey",
      data: {
        type: "JourneyNode",
        nodeTypeProps: {
          type: JourneyNodeType.EntryNode,
          segmentId: journey.definition.entryNode.segment,
        },
      },
    },
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

  let journeyEdges: Edge<EdgeData>[] = [
    {
      id: `${JourneyNodeType.EntryNode}=>${JourneyNodeType.ExitNode}`,
      source: JourneyNodeType.EntryNode,
      target: JourneyNodeType.ExitNode,
      type: "workflow",
      data: {
        type: "WorkflowEdge",
        disableMarker: true,
      },
    },
  ];

  const firstBodyNode = journey.definition.nodes.find(
    (n) => n.id === journey.definition.entryNode.child
  );
  if (!firstBodyNode) {
    throw new Error("Malformed journey, missing first body node.");
  }

  let remainingNodes: [JourneyNode, string][] = [
    [firstBodyNode, JourneyNodeType.EntryNode],
  ];

  const seenNodes = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [node, source] = remainingNodes.pop()!;

    if (node.type === JourneyNodeType.ExitNode) {
      if (remainingNodes.length === 0) {
        break;
      }
      continue;
    }

    if (node.type === JourneyNodeType.EntryNode) {
      throw new Error("Entry node should already be handled");
    }
    if (seenNodes.has(node.id)) {
      if (remainingNodes.length === 0) {
        break;
      }
      continue;
    }
    seenNodes.add(node.id);

    const target = journeyEdges.find((e) => e.source === source)?.target;

    if (!target) {
      throw new Error("Malformed journey, missing target.");
    }
    // {
    //   node: {
    //     id: 'wait-for-first-deployment-2',
    //     type: 'WaitForNode',
    //     timeoutChild: 'ExitNode',
    //     timeoutSeconds: 604800,
    //     segmentChildren: [ [Object] ]
    //   },
    //   source: 'code-deployment-reminder-1a',
    //   target: 'wait-for-first-deployment-1-empty'
    // }
    // FIXME should be source: wait-for-first-deployment-1-empty

    console.log({
      node,
      source,
      target,
    });
    const state = journeyNodeToState(node, source, target);

    let newRemainingNodes: [JourneyNode, string][];
    const { nodeTypeProps } = state.journeyNode.data;

    switch (nodeTypeProps.type) {
      case JourneyNodeType.DelayNode: {
        if (node.type !== JourneyNodeType.DelayNode) {
          throw new Error("Malformed journey, missing delay node.");
        }

        const childNode = getJourneyNode(journey.definition, node.child);
        if (!childNode) {
          throw new Error("Malformed journey, missing delay node child.");
        }
        newRemainingNodes = [[childNode, state.journeyNode.id]];
        break;
      }
      case JourneyNodeType.MessageNode: {
        if (node.type !== JourneyNodeType.MessageNode) {
          throw new Error("Malformed journey, missing message node.");
        }
        const childNode = getJourneyNode(journey.definition, node.child);

        if (!childNode) {
          throw new Error("Malformed journey, missing message node child.");
        }
        newRemainingNodes = [[childNode, state.journeyNode.id]];
        break;
      }
      case JourneyNodeType.SegmentSplitNode: {
        if (node.type !== JourneyNodeType.SegmentSplitNode) {
          throw new Error("Malformed journey, missing segment split node.");
        }
        const trueNode = getJourneyNode(
          journey.definition,
          node.variant.trueChild
        );
        const falseNode = getJourneyNode(
          journey.definition,
          node.variant.falseChild
        );

        if (!trueNode || !falseNode) {
          throw new Error(
            "Malformed journey, missing segment split node children."
          );
        }
        newRemainingNodes = [];
        newRemainingNodes.push([trueNode, nodeTypeProps.trueLabelNodeId]);
        newRemainingNodes.push([falseNode, nodeTypeProps.falseLabelNodeId]);
        break;
      }
      case JourneyNodeType.WaitForNode: {
        if (node.type !== JourneyNodeType.WaitForNode) {
          throw new Error("Malformed journey, missing wait for node.");
        }
        const timeoutNode = getJourneyNode(
          journey.definition,
          node.timeoutChild
        );
        if (!timeoutNode) {
          throw new Error("Malformed journey, missing wait for node timeout.");
        }
        const segmentChild = node.segmentChildren[0];
        if (!segmentChild) {
          throw new Error(`Malformed journey, missing wait for node segment.`);
        }
        const segmentNode = getJourneyNode(journey.definition, segmentChild.id);
        if (!segmentNode) {
          throw new Error(
            `Malformed journey, missing wait for node segment. ${segmentChild.id}`
          );
        }

        const uiSegmentChild = nodeTypeProps.segmentChildren[0];
        if (!uiSegmentChild) {
          throw new Error(
            "Malformed journey, missing wait for node segment children."
          );
        }
        newRemainingNodes = [];
        newRemainingNodes.push([segmentNode, uiSegmentChild.labelNodeId]);
        newRemainingNodes.push([timeoutNode, nodeTypeProps.timeoutLabelNodeId]);
        break;
      }
      case JourneyNodeType.EntryNode:
        throw new Error("Entry node should already be handled");
      case JourneyNodeType.ExitNode:
        throw new Error("Exit node should already be handled");
    }
    remainingNodes = remainingNodes.concat(newRemainingNodes);

    const newNodes: Node<NodeData>[] = [
      state.journeyNode,
      ...state.nonJourneyNodes,
    ];

    const newState = newStateFromNodes({
      source,
      target,
      nodes: newNodes,
      edges: state.edges,
      existingNodes: journeyNodes,
      existingEdges: journeyEdges,
    });
    journeyEdges = newState.edges;
    journeyNodes = newState.nodes;

    if (remainingNodes.length === 0) {
      break;
    }
  }

  journeyNodes = layoutNodes(journeyNodes, journeyEdges);
  const journeyNodesIndex = buildNodesIndex(journeyNodes);

  return {
    journeyName: journey.name,
    journeyNodes,
    journeyEdges,
    journeyNodesIndex,
  };
}

export function findDirectParents(
  parentId: string,
  edges: JourneyContent["journeyEdges"]
): string[] {
  return edges.flatMap((e) => (e.target === parentId ? e.source : []));
}

export function findDirectChildren(
  parentId: string,
  edges: JourneyContent["journeyEdges"]
): string[] {
  return edges.flatMap((e) => (e.source === parentId ? e.target : []));
}

/**
 * find all ancestors of parent node with relative depth of node
 * @param parentId
 * @param edges
 * @returns
 */
export function findAllAncestors(
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

    const directChildren = findDirectChildren(next.node, edges);

    for (const child of directChildren) {
      if (!children.has(child)) {
        unprocessed.push({ node: child, depth: next.depth + 1 });
        children.set(child, next.depth + 1);
      }
    }
  }
  return children;
}

function findAllParents(
  childId: string,
  edges: JourneyContent["journeyEdges"]
): Set<string> {
  const parents = new Set<string>();
  const unprocessed = [childId];

  while (unprocessed.length) {
    const next = unprocessed.pop();
    if (!next) {
      throw new Error("next should exist");
    }
    const directParents = findDirectParents(next, edges);

    for (const parent of directParents) {
      unprocessed.push(parent);
      parents.add(parent);
    }
  }
  return parents;
}

function combinedDepthMaps(maps: Map<string, number>[]): Map<string, number> {
  const intersection = new Map<string, number>();
  const keyCounts = new Map<string, number>();

  for (const map of maps) {
    for (const key of map.keys()) {
      keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
    }
  }

  for (const map of maps) {
    for (const [key, value] of map.entries()) {
      if (keyCounts.get(key) === maps.length) {
        const existingValue = intersection.get(key) || 0;
        intersection.set(key, value + existingValue);
      }
    }
  }

  return intersection;
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
      const node = state.journeyNodes.find((n) => n.id === nodeId);
      if (!node || node.data.type !== "JourneyNode") {
        return state;
      }

      const nodeType = node.data.nodeTypeProps.type;
      const directChildren = findDirectChildren(node.id, state.journeyEdges);

      if (
        nodeType === JourneyNodeType.EntryNode ||
        nodeType === JourneyNodeType.ExitNode
      ) {
        return state;
      }

      const nodesToDelete = new Set<string>([node.id]);
      const edgesToAdd: [string, string][] = [];

      if (directChildren.length > 1) {
        directChildren.forEach((c) => nodesToDelete.add(c));

        const ancestorSets = directChildren.map((c) =>
          findAllAncestors(c, state.journeyEdges)
        );
        const sharedAncestorsMap = combinedDepthMaps(ancestorSets);

        let firstSharedAncestor: string | null = null;
        let secondSharedAncestor: string | null = null;
        let minDepth = Infinity;
        let secondMinDepth = Infinity;

        for (const [sharedNode, depth] of sharedAncestorsMap.entries()) {
          if (depth < minDepth) {
            secondSharedAncestor = firstSharedAncestor;
            secondMinDepth = minDepth;
            firstSharedAncestor = sharedNode;
            minDepth = depth;
          } else if (
            depth < secondMinDepth &&
            sharedNode !== firstSharedAncestor
          ) {
            secondSharedAncestor = sharedNode;
            secondMinDepth = depth;
          }
        }

        if (!firstSharedAncestor || !secondSharedAncestor) {
          throw new Error(
            "node with multiple children lacking correct shared ancestors"
          );
        }

        nodesToDelete.add(firstSharedAncestor);

        const firstAncestorParents = findAllParents(
          firstSharedAncestor,
          state.journeyEdges
        );

        for (const ancestorSet of ancestorSets) {
          for (const ancestor of Array.from(ancestorSet.keys())) {
            if (firstAncestorParents.has(ancestor)) {
              nodesToDelete.add(ancestor);
            }
          }
        }

        const parents = findDirectParents(node.id, state.journeyEdges);
        for (const p of parents) {
          edgesToAdd.push([p, secondSharedAncestor]);
        }
      } else if (directChildren.length === 1 && directChildren[0]) {
        const parents = findDirectParents(node.id, state.journeyEdges);
        const child = directChildren[0];
        parents.forEach((p) => {
          edgesToAdd.push([p, child]);
        });
      }

      state.journeyEdges = state.journeyEdges.filter(
        (e) => !(nodesToDelete.has(e.source) || nodesToDelete.has(e.target))
      );
      state.journeyNodes = state.journeyNodes.filter(
        (n) => !nodesToDelete.has(n.id)
      );
      edgesToAdd.forEach(([source, target]) => {
        state.journeyEdges.push({
          id: `${source}->${target}`,
          source,
          target,
          type: "workflow",
        });
      });

      state.journeyNodes = layoutNodes(state.journeyNodes, state.journeyEdges);
      state.journeyNodesIndex = buildNodesIndex(state.journeyNodes);
      return state;
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
