import { Node, XYPosition } from "@xyflow/react";
import { JourneyNodeType, JourneyUiEdgeType } from "isomorphic-lib/src/types";

import {
  AdditionalJourneyNodeType,
  JourneyNodeUiProps,
  JourneyUiEdge,
  JourneyUiNode,
  JourneyUiNodeType,
} from "../../lib/types";
import { layoutNodes } from "./layoutNodes";
import { defaultNodeTypeProps } from "./nodeTypes/defaultNodeTypeProps";

export const DEFAULT_EDGES: JourneyUiEdge[] = [
  {
    id: `${AdditionalJourneyNodeType.EntryUiNode}=>${JourneyNodeType.ExitNode}`,
    source: AdditionalJourneyNodeType.EntryUiNode,
    target: JourneyNodeType.ExitNode,
    type: "workflow",
    data: {
      type: JourneyUiEdgeType.JourneyUiDefinitionEdgeProps,
    },
  },
];

export const placeholderNodePosition: XYPosition = { x: 0, y: 0 };

export const DEFAULT_JOURNEY_NODES: JourneyUiNode[] = layoutNodes(
  [
    {
      id: AdditionalJourneyNodeType.EntryUiNode,
      data: {
        type: JourneyUiNodeType.JourneyUiNodeDefinitionProps,
        nodeTypeProps: defaultNodeTypeProps({
          type: AdditionalJourneyNodeType.EntryUiNode,
          nodes: [],
          subscriptionGroups: [],
        }),
      },
      position: placeholderNodePosition,
      type: "journey",
    },
    {
      id: JourneyNodeType.ExitNode,
      data: {
        type: JourneyUiNodeType.JourneyUiNodeDefinitionProps,
        nodeTypeProps: defaultNodeTypeProps({
          type: JourneyNodeType.ExitNode,
          nodes: [],
          subscriptionGroups: [],
        }),
      },
      position: placeholderNodePosition,
      type: "journey",
    },
  ],
  DEFAULT_EDGES,
);

export function buildNodesIndex(
  nodes: Node<JourneyNodeUiProps>[],
): Record<string, number> {
  return nodes.reduce<Record<string, number>>((memo, node, i) => {
    memo[node.id] = i;
    return memo;
  }, {});
}
