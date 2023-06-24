import { ChannelType, JourneyNodeType } from "isomorphic-lib/src/types";
import { Node } from "reactflow";
import { v4 as uuid } from "uuid";

import { NodeData, NodeTypeProps } from "../../../lib/types";

export const defaultSegmentSplitName = "True / False Branch";

export default function defaultNodeTypeProps(
  type: JourneyNodeType,
  nodes: Node<NodeData>[]
): NodeTypeProps {
  switch (type) {
    case JourneyNodeType.EntryNode:
      return {
        type,
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
            n.data.nodeTypeProps.type === JourneyNodeType.MessageNode
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
      };
    case JourneyNodeType.SegmentSplitNode:
      return {
        type,
        name: defaultSegmentSplitName,
        trueLabelNodeId: uuid(),
        falseLabelNodeId: uuid(),
      };
    default:
      throw new Error(`Unimplemented journey node type ${type}`);
  }
}
