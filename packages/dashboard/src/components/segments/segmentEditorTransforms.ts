import {
  BodySegmentNode,
  InternalEventType,
  PerformedSegmentNode,
  RelationalOperators,
  SegmentDefinition,
  SegmentNode,
  SegmentNodeType,
  SegmentOperatorType,
} from "isomorphic-lib/src/types";

export const EDITOR_SEGMENT_NODE_TYPE = {
  UserPerformedJourney: "UserPerformedJourney",
} as const;

export type EditorOnlySegmentNodeType =
  typeof EDITOR_SEGMENT_NODE_TYPE.UserPerformedJourney;

export interface UserPerformedJourneyEditorNode {
  type: typeof EDITOR_SEGMENT_NODE_TYPE.UserPerformedJourney;
  id: string;
  journeyId: string;
  nodeId: string;
  times?: number;
  timesOperator?: RelationalOperators;
}

export type EditorBodySegmentNode =
  | BodySegmentNode
  | UserPerformedJourneyEditorNode;

export type EditorSegmentNode = SegmentNode | UserPerformedJourneyEditorNode;

export interface EditorSegmentDefinition {
  entryNode: EditorSegmentNode;
  nodes: EditorBodySegmentNode[];
}

export function isUserPerformedJourneyEditorNode(
  node: EditorSegmentNode,
): node is UserPerformedJourneyEditorNode {
  return node.type === EDITOR_SEGMENT_NODE_TYPE.UserPerformedJourney;
}

export function isEditorBodySegmentNode(
  node: EditorSegmentNode,
): node is EditorBodySegmentNode {
  return node.type !== SegmentNodeType.Manual;
}

function extractJourneyNode(node: PerformedSegmentNode): {
  journeyId: string;
  nodeId: string;
} | null {
  if (node.event !== InternalEventType.JourneyNodeProcessed) {
    return null;
  }

  if (
    node.times !== 1 ||
    node.timesOperator !== RelationalOperators.GreaterThanOrEqual ||
    node.properties?.length !== 2
  ) {
    return null;
  }

  const journeyIdProp = node.properties.find((p) => p.path === "journeyId");
  const nodeIdProp = node.properties.find((p) => p.path === "nodeId");

  if (!journeyIdProp || !nodeIdProp) {
    return null;
  }

  if (journeyIdProp.operator.type !== SegmentOperatorType.Equals) {
    return null;
  }

  if (nodeIdProp.operator.type !== SegmentOperatorType.Equals) {
    return null;
  }

  const otherProperties = node.properties.filter(
    (p) => p.path !== "journeyId" && p.path !== "nodeId",
  );
  if (otherProperties.length) {
    return null;
  }

  return {
    journeyId: String(journeyIdProp.operator.value),
    nodeId: String(nodeIdProp.operator.value),
  };
}

function performedToUserPerformedJourney(
  node: PerformedSegmentNode,
): UserPerformedJourneyEditorNode | null {
  const ids = extractJourneyNode(node);
  if (!ids) {
    return null;
  }

  return {
    type: EDITOR_SEGMENT_NODE_TYPE.UserPerformedJourney,
    id: node.id,
    journeyId: ids.journeyId,
    nodeId: ids.nodeId,
    times: node.times,
    timesOperator: node.timesOperator,
  };
}

function transformNodeToEditor(node: SegmentNode): EditorSegmentNode {
  if (node.type === SegmentNodeType.Performed) {
    return performedToUserPerformedJourney(node) ?? node;
  }

  return node;
}

export function toEditorDefinition(
  definition: SegmentDefinition,
): EditorSegmentDefinition {
  return {
    entryNode: transformNodeToEditor(definition.entryNode),
    nodes: definition.nodes
      .map((node) => transformNodeToEditor(node))
      .filter((node): node is EditorBodySegmentNode =>
        isEditorBodySegmentNode(node),
      ),
  };
}

function makePerformedNode({
  id,
  journeyId,
  nodeId,
  times,
  timesOperator,
}: {
  id: string;
  journeyId: string;
  nodeId: string;
  times: number;
  timesOperator: RelationalOperators;
}): PerformedSegmentNode {
  return {
    type: SegmentNodeType.Performed,
    id,
    event: InternalEventType.JourneyNodeProcessed,
    times,
    timesOperator,
    properties: [
      {
        path: "journeyId",
        operator: {
          type: SegmentOperatorType.Equals,
          value: journeyId,
        },
      },
      {
        path: "nodeId",
        operator: {
          type: SegmentOperatorType.Equals,
          value: nodeId,
        },
      },
    ],
  };
}

function userPerformedJourneyToBackend(node: UserPerformedJourneyEditorNode): {
  primary: SegmentNode;
  secondary: BodySegmentNode[];
} {
  const times = node.times ?? 1;
  const timesOperator =
    node.timesOperator ?? RelationalOperators.GreaterThanOrEqual;

  return {
    primary: makePerformedNode({
      id: node.id,
      journeyId: node.journeyId,
      nodeId: node.nodeId,
      times,
      timesOperator,
    }),
    secondary: [],
  };
}

function transformNodeFromEditor(node: EditorSegmentNode): {
  primary: SegmentNode;
  secondary: BodySegmentNode[];
} {
  if (isUserPerformedJourneyEditorNode(node)) {
    return userPerformedJourneyToBackend(node);
  }

  return {
    primary: node,
    secondary: [],
  };
}

function transformBodyNodeFromEditor(
  node: EditorBodySegmentNode,
): BodySegmentNode[] {
  const { primary, secondary } = transformNodeFromEditor(node);
  if (!isEditorBodySegmentNode(primary)) {
    return secondary;
  }
  return [primary, ...secondary];
}

export function fromEditorDefinition(
  definition: EditorSegmentDefinition,
): SegmentDefinition {
  const entry = transformNodeFromEditor(definition.entryNode);

  return {
    entryNode: entry.primary,
    nodes: [
      ...definition.nodes.flatMap((node) => transformBodyNodeFromEditor(node)),
      ...entry.secondary,
    ],
  };
}
