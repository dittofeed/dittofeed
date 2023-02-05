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
  MessageNodeVariantType,
  SegmentSplitNode,
  SegmentSplitVariantType,
} from "isomorphic-lib/src/types";
import { err, ok, Result } from "neverthrow";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  XYPosition,
} from "reactflow";
import { v4 as uuid } from "uuid";
import { type immer } from "zustand/middleware/immer";

import {
  EdgeData,
  JourneyContent,
  JourneyState,
  NodeData,
} from "../../lib/types";
import findJourneyNode from "./findJourneyNode";
import findNode from "./findNode";
import { layoutNodes } from "./layoutNodes";
import defaultNodeTypeProps, {
  defaultSegmentSplitName,
} from "./nodeTypes/defaultNodeTypeProps";

const defaultEdges: Edge[] = [
  {
    id: `${JourneyNodeType.EntryNode}=>${JourneyNodeType.ExitNode}`,
    source: JourneyNodeType.EntryNode,
    target: JourneyNodeType.ExitNode,
    type: "workflow",
  },
];

const placeholderNodePosition: XYPosition = { x: 0, y: 0 };

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

const defaultNodes = layoutNodes(
  [
    {
      id: JourneyNodeType.EntryNode,
      data: {
        type: "JourneyNode",
        nodeTypeProps: defaultNodeTypeProps(JourneyNodeType.EntryNode, []),
      },
      position: placeholderNodePosition,
      type: "journey",
    },
    {
      id: JourneyNodeType.ExitNode,
      data: {
        type: "JourneyNode",
        nodeTypeProps: defaultNodeTypeProps(JourneyNodeType.ExitNode, []),
      },
      position: placeholderNodePosition,
      type: "journey",
    },
  ],
  defaultEdges
);

function buildNodesIndex(nodes: Node<NodeData>[]): Record<string, number> {
  return nodes.reduce<Record<string, number>>((memo, node, i) => {
    memo[node.id] = i;
    return memo;
  }, {});
}

type JourneyStateForResource = Pick<
  JourneyState,
  "journeyNodes" | "journeyEdges" | "journeyNodesIndex" | "journeyName"
>;

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
          variant: {
            type: MessageNodeVariantType.Email,
            templateId: props.templateId,
          },
        };
        newNodeResource = messageNode;
        break;
      }
      default:
        throw new Error(`Unhandled node type ${props.type}.`);
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

interface EdgeIntent {
  parentId: string;
  type: "placeholder" | "workflow";
}

export function journeyToState(
  journey: JourneyResource
): JourneyStateForResource {
  const journeyNodes: Node<NodeData>[] = [];
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
              name: `Message - ${node.id}`,
              templateId: node.variant.templateId,
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

  const journeyNodesIndex: Record<string, number> =
    buildNodesIndex(journeyNodes);

  return {
    journeyNodes: layoutNodes(journeyNodes, journeyEdges),
    journeyNodesIndex,
    journeyEdges,
    journeyName: journey.name,
  };
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
});
