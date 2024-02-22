import {
  ChannelType,
  DelayVariantType,
  JourneyNodeType,
} from "isomorphic-lib/src/types";
import { Node } from "reactflow";
import { v4 as uuid } from "uuid";

import {
  AdditionalJourneyNodeType,
  NodeData,
  NodeTypeProps,
} from "../../../lib/types";

export const defaultSegmentSplitName = "True / False Branch";

export default function defaultNodeTypeProps(
  type: NodeTypeProps["type"],
  nodes: Node<NodeData>[],
): NodeTypeProps {
  switch (type) {
    case AdditionalJourneyNodeType.UiEntryNode:
      return {
        type,
        variant: {
          type: JourneyNodeType.SegmentEntryNode,
        },
      };
    case JourneyNodeType.ExitNode:
      return {
        type,
      };
    case JourneyNodeType.MessageNode: {
      const numMessages =
        nodes.filter(
          (n) =>
            n.data.type === "JourneyNode" &&
            n.data.nodeTypeProps.type === JourneyNodeType.MessageNode,
        ).length + 1;
      return {
        type,
        channel: ChannelType.Email,
        name: `Message ${numMessages}`,
      };
    }
    case JourneyNodeType.DelayNode:
      return {
        type,
        variant: {
          type: DelayVariantType.Second,
        },
      };
    case JourneyNodeType.SegmentSplitNode:
      return {
        type,
        name: defaultSegmentSplitName,
        trueLabelNodeId: uuid(),
        falseLabelNodeId: uuid(),
      };
    case JourneyNodeType.WaitForNode:
      return {
        type,
        timeoutLabelNodeId: uuid(),
        // 1 week
        timeoutSeconds: 604800,
        segmentChildren: [
          {
            labelNodeId: uuid(),
          },
        ],
      };
  }
}
