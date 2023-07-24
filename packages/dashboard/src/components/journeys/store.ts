import {
  CompletionStatus,
  DelayNode,
  DelayVariantType,
  EntryNode,
  ExitNode,
  JourneyBodyNode,
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
import { defaultSegmentSplitName } from "./nodeTypes/defaultNodeTypeProps";
import { getJourneyNode } from "isomorphic-lib/src/journeys";

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

// would ideally be initialized from partial of journey node or optional in some way so that be reused with create connection logic
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
  const nonJourneyNodes: Node<NonJourneyNodeData>[] = [];
  const edges: Edge<EdgeData>[] = [];

  function pushDualEdge({
    leftId,
    rightId,
    leftLabel,
    rightLabel,
    emptyId,
  }: {
    emptyId: string;
    leftId: string;
    rightId: string;
    leftLabel: string;
    rightLabel: string;
  }) {
    const n = node as JourneyBodyNode;
    nonJourneyNodes.push({
      id: leftId,
      position: placeholderNodePosition,
      type: "label",
      data: {
        type: "LabelNode",
        title: leftLabel,
      },
    });
    nonJourneyNodes.push({
      id: rightId,
      position: placeholderNodePosition,
      type: "label",
      data: {
        type: "LabelNode",
        title: rightLabel,
      },
    });
    nonJourneyNodes.push({
      id: emptyId,
      position: placeholderNodePosition,
      type: "empty",
      data: {
        type: "EmptyNode",
      },
    });

    edges.push({
      id: `${source}=>${n.id}`,
      source,
      target: n.id,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: "WorkflowEdge",
        disableMarker: true,
      },
    });
    edges.push({
      id: `${n.id}=>${leftId}`,
      source: n.id,
      target: leftId,
      type: "placeholder",
      sourceHandle: "bottom",
    });
    edges.push({
      id: `${n.id}=>${rightId}`,
      source: n.id,
      target: rightId,
      type: "placeholder",
      sourceHandle: "bottom",
    });
    edges.push({
      id: `${leftId}=>${emptyId}`,
      source: leftId,
      target: emptyId,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: "WorkflowEdge",
        disableMarker: true,
      },
    });
    edges.push({
      id: `${rightId}=>${emptyId}`,
      source: rightId,
      target: emptyId,
      type: "workflow",
      sourceHandle: "bottom",
      data: {
        type: "WorkflowEdge",
        disableMarker: true,
      },
    });
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

  switch (node.type) {
    case JourneyNodeType.DelayNode:
      edges.push({
        id: `${source}=>${node.id}`,
        source,
        target: node.id,
        type: "workflow",
        sourceHandle: "bottom",
        data: {
          type: "WorkflowEdge",
        },
      });
      edges.push({
        id: `${node.id}=>${target}`,
        source,
        target: node.id,
        type: "workflow",
        sourceHandle: "bottom",
        data: {
          type: "WorkflowEdge",
        },
      });

      nodeTypeProps = {
        type: JourneyNodeType.DelayNode,
        seconds: node.variant.seconds,
      };
      break;
    case JourneyNodeType.MessageNode:
      edges.push({
        id: `${source}=>${node.id}`,
        source,
        target: node.id,
        type: "workflow",
        sourceHandle: "bottom",
        data: {
          type: "WorkflowEdge",
        },
      });
      edges.push({
        id: `${node.id}=>${target}`,
        source: node.id,
        target,
        type: "workflow",
        sourceHandle: "bottom",
        data: {
          type: "WorkflowEdge",
        },
      });

      nodeTypeProps = {
        type: JourneyNodeType.MessageNode,
        channel: node.variant.type,
        name: node.name ?? "",
        templateId: node.variant.templateId,
        subscriptionGroupId: node.subscriptionGroupId,
      };
      break;
    case JourneyNodeType.SegmentSplitNode: {
      const trueId = uuid();
      const falseId = uuid();
      const emptyId = uuid();

      pushDualEdge({
        emptyId,
        leftId: trueId,
        rightId: falseId,
        leftLabel: "true",
        rightLabel: "false",
      });

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
      const segmentChild = node.segmentChildren[0];
      if (!segmentChild) {
        throw new Error("Malformed journey, WaitForNode has no children.");
      }

      const segmentChildLabelNodeId = uuid();
      const timeoutLabelNodeId = uuid();

      pushDualEdge({
        emptyId: timeoutLabelNodeId,
        leftId: segmentChildLabelNodeId,
        rightId: timeoutLabelNodeId,
        leftLabel: WAIT_FOR_SATISFY_LABEL,
        rightLabel: waitForTimeoutLabel(node.timeoutSeconds),
      });
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

// FIXME reuse in store
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
  nodes: Node<NonJourneyNodeData>[];
} {
  const newEdges = existingEdges
    .filter((e) => !(e.source === source && e.target === target))
    .concat(edges);

  const newNodes = layoutNodes(existingNodes.concat(nodes), newEdges);

  return {
    edges: newEdges,
    nodes: newNodes,
  };
}

interface EdgeIntent {
  parentId: string;
  type: "placeholder" | "workflow";
}

export function journeyToStateV2(
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
    (n) => (n.id = journey.definition.entryNode.child)
  );
  if (!firstBodyNode) {
    throw new Error("Malformed journey, missing first body node.");
  }

  let remainingNodes: [JourneyNode, string][] = [
    [firstBodyNode, JourneyNodeType.EntryNode],
  ];
  while (true) {
    const [node, source] = remainingNodes.pop()!;

    if (node.type === JourneyNodeType.ExitNode) {
      if (remainingNodes.length === 0) {
        break;
      }
      continue;
    }

    const target = journeyEdges.find((e) => e.source === source)?.target;

    if (!target) {
      throw new Error("Malformed journey, missing target.");
    }
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
      default:
        // FIXME
        throw new Error("Unimplemented node type");
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

  const journeyNodesIndex = buildNodesIndex(journeyNodes);

  console.log("journeyNodes", journeyNodes);
  console.log("journeyEdges", journeyEdges);
  return {
    journeyName: journey.name,
    journeyNodes,
    journeyEdges,
    journeyNodesIndex,
  };
}

export function journeyToState(
  journey: JourneyResource
): JourneyStateForResource {
  let journeyNodes: Node<NodeData>[] = [];
  const journeyEdges: Edge<EdgeData>[] = [];

  journeyNodes.push({
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
  });

  journeyEdges.push({
    id: `${JourneyNodeType.EntryNode}=>${journey.definition.entryNode.child}`,
    source: JourneyNodeType.EntryNode,
    target: journey.definition.entryNode.child,
    type: "workflow",
  });

  journeyNodes.push({
    id: JourneyNodeType.ExitNode,
    position: placeholderNodePosition,
    type: "journey",
    data: {
      type: "JourneyNode",
      nodeTypeProps: {
        type: JourneyNodeType.ExitNode,
      },
    },
  });

  const edgeMultiMap = new Map<string, EdgeIntent[]>();

  for (const node of journey.definition.nodes) {
    if (node.type === JourneyNodeType.SegmentSplitNode) {
      const trueId = uuid();
      const falseId = uuid();

      journeyNodes.push({
        id: node.id,
        position: placeholderNodePosition,
        type: "journey",
        data: {
          type: "JourneyNode",
          nodeTypeProps: {
            type: JourneyNodeType.SegmentSplitNode,
            name: node.name ?? defaultSegmentSplitName,
            trueLabelNodeId: trueId,
            falseLabelNodeId: falseId,
            segmentId: node.variant.segment,
          },
        },
      });

      journeyNodes.push({
        id: trueId,
        position: placeholderNodePosition,
        type: "label",
        data: {
          type: "LabelNode",
          title: "true",
        },
      });
      journeyNodes.push({
        id: falseId,
        position: placeholderNodePosition,
        type: "label",
        data: {
          type: "LabelNode",
          title: "false",
        },
      });

      multiMapSet(
        { parentId: node.id, type: "placeholder" },
        trueId,
        edgeMultiMap
      );
      multiMapSet(
        { parentId: trueId, type: "workflow" },
        node.variant.trueChild,
        edgeMultiMap
      );
      multiMapSet(
        { parentId: node.id, type: "placeholder" },
        falseId,
        edgeMultiMap
      );
      multiMapSet(
        { parentId: falseId, type: "workflow" },
        node.variant.falseChild,
        edgeMultiMap
      );
      continue;
    }
    if (node.type === JourneyNodeType.WaitForNode) {
      // TODO support more than one segment child node
      const segmentChild = node.segmentChildren[0];
      if (!segmentChild) {
        throw new Error("Malformed journey, WaitForNode has no children.");
      }
      const segmentChildLabelNodeId = uuid();
      const timeoutLabelNodeId = uuid();

      journeyNodes.push({
        id: node.id,
        position: placeholderNodePosition,
        type: "journey",
        data: {
          type: "JourneyNode",
          nodeTypeProps: {
            type: JourneyNodeType.WaitForNode,
            timeoutLabelNodeId,
            timeoutSeconds: node.timeoutSeconds,
            segmentChildren: [
              {
                labelNodeId: segmentChildLabelNodeId,
                segmentId: segmentChild.segmentId,
              },
            ],
          },
        },
      });

      journeyNodes.push({
        id: segmentChildLabelNodeId,
        position: placeholderNodePosition,
        type: "label",
        data: {
          type: "LabelNode",
          title: WAIT_FOR_SATISFY_LABEL,
        },
      });
      journeyNodes.push({
        id: timeoutLabelNodeId,
        position: placeholderNodePosition,
        type: "label",
        data: {
          type: "LabelNode",
          title: waitForTimeoutLabel(node.timeoutSeconds),
        },
      });

      multiMapSet(
        { parentId: node.id, type: "placeholder" },
        segmentChildLabelNodeId,
        edgeMultiMap
      );
      multiMapSet(
        { parentId: segmentChildLabelNodeId, type: "workflow" },
        segmentChild.id,
        edgeMultiMap
      );
      multiMapSet(
        { parentId: node.id, type: "placeholder" },
        timeoutLabelNodeId,
        edgeMultiMap
      );
      multiMapSet(
        { parentId: timeoutLabelNodeId, type: "workflow" },
        node.timeoutChild,
        edgeMultiMap
      );
      continue;
    }

    if (
      node.type === JourneyNodeType.ExperimentSplitNode ||
      node.type === JourneyNodeType.RateLimitNode
    ) {
      console.error("Warning unimplemented node type");
      continue;
    }

    let uiNode: Node<NodeData>;
    switch (node.type) {
      case JourneyNodeType.DelayNode:
        uiNode = {
          id: node.id,
          position: placeholderNodePosition,
          type: "journey",
          data: {
            type: "JourneyNode",
            nodeTypeProps: {
              type: JourneyNodeType.DelayNode,
              seconds: node.variant.seconds,
            },
          },
        };
        break;
      case JourneyNodeType.MessageNode:
        uiNode = {
          id: node.id,
          position: placeholderNodePosition,
          type: "journey",
          data: {
            type: "JourneyNode",
            nodeTypeProps: {
              type: JourneyNodeType.MessageNode,
              channel: node.variant.type,
              name: node.name ?? `Message - ${node.id}`,
              templateId: node.variant.templateId,
              subscriptionGroupId: node.subscriptionGroupId,
            },
          },
        };
    }

    journeyNodes.push(uiNode);
    multiMapSet(
      { parentId: node.id, type: "workflow" },
      node.child,
      edgeMultiMap
    );
  }

  edgeMultiMap.forEach((parents, child) => {
    if (parents.length > 1) {
      const emptyId = uuid();

      journeyNodes.push({
        id: emptyId,
        position: placeholderNodePosition,
        type: "empty",
        data: {
          type: "EmptyNode",
        },
      });

      parents.forEach((parent) => {
        journeyEdges.push({
          id: `${parent.parentId}=>${emptyId}`,
          source: parent.parentId,
          target: emptyId,
          type: parent.type,
        });
      });

      journeyEdges.push({
        id: `${emptyId}=>${child}`,
        source: emptyId,
        target: child,
        type: "workflow",
      });
    } else if (parents.length === 1 && parents[0]) {
      const parent = parents[0];

      journeyEdges.push({
        id: `${parent.parentId}=>${child}`,
        source: parent.parentId,
        target: child,
        type: parent.type,
      });
    }
  });
  journeyNodes = layoutNodes(journeyNodes, journeyEdges);

  const journeyNodesIndex: Record<string, number> =
    buildNodesIndex(journeyNodes);

  return {
    journeyNodes,
    journeyNodesIndex,
    journeyEdges,
    journeyName: journey.name,
  };
}

function findDirectChildren(
  parentId: string,
  edges: JourneyContent["journeyEdges"]
): string[] {
  return edges.flatMap((e) => (e.source === parentId ? e.target : []));
}

function findDirectParents(
  parentId: string,
  edges: JourneyContent["journeyEdges"]
): string[] {
  return edges.flatMap((e) => (e.target === parentId ? e.source : []));
}

function findAllAncestors(
  parentId: string,
  edges: JourneyContent["journeyEdges"]
): Set<string> {
  const children = new Set<string>();
  const unprocessed = [parentId];

  while (unprocessed.length) {
    const next = unprocessed.pop();
    if (!next) {
      throw new Error("next should exist");
    }
    const directChildren = findDirectChildren(next, edges);

    for (const child of directChildren) {
      unprocessed.push(child);
      children.add(child);
    }
  }
  return children;
}

function intersectionOfSets<T>(sets: Set<T>[]): Set<T> {
  if (sets.length === 0) {
    return new Set();
  }

  const intersection = new Set<T>(sets[0]);
  for (const set of sets.slice(1)) {
    for (const element of Array.from(intersection)) {
      if (!set.has(element)) {
        intersection.delete(element);
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
        const sharedAncestors = Array.from(intersectionOfSets(ancestorSets));
        const firstSharedAncestor = sharedAncestors[0];
        const secondSharedAncestor = sharedAncestors[1];
        if (!firstSharedAncestor || !secondSharedAncestor) {
          throw new Error(
            "node with multiple children lacking correct shared ancestors"
          );
        }

        nodesToDelete.add(firstSharedAncestor);

        for (const ancestorSet of ancestorSets) {
          for (const ancestor of Array.from(ancestorSet)) {
            if (ancestor === firstSharedAncestor) {
              break;
            }
            nodesToDelete.add(ancestor);
          }
        }
        const parents = findDirectParents(node.id, state.journeyEdges);
        parents.forEach((p) => {
          edgesToAdd.push([p, secondSharedAncestor]);
        });
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
      state.journeyEdges = state.journeyEdges
        .filter((e) => !(e.source === source && e.target === target))
        .concat(edges);
      state.journeyNodes = layoutNodes(
        state.journeyNodes.concat(nodes),
        state.journeyEdges
      );
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
