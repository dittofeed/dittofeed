import {
  ChannelType,
  DelayVariantType,
  JourneyNodeType,
  JourneyUiBodyNodeTypeProps,
} from "isomorphic-lib/src/types";
import { Node } from "reactflow";
import { v4 as uuid } from "uuid";

import {
  AdditionalJourneyNodeType,
  JourneyNodeUiProps,
  JourneyUiNodeType,
  JourneyUiNodeTypeProps,
} from "../../../lib/types";

export const defaultSegmentSplitName = "True / False Branch";

export function defaultBodyNodeTypeProps(
  type: JourneyUiBodyNodeTypeProps["type"],
  nodes: Node<JourneyNodeUiProps>[],
): JourneyUiBodyNodeTypeProps {
  switch (type) {
    case JourneyNodeType.MessageNode: {
      const numMessages =
        nodes.filter(
          (n) =>
            n.data.type === JourneyUiNodeType.JourneyUiNodeDefinitionProps &&
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

export function defaultNodeTypeProps(
  type: JourneyUiNodeTypeProps["type"],
  nodes: Node<JourneyNodeUiProps>[],
): JourneyUiNodeTypeProps {
  switch (type) {
    case AdditionalJourneyNodeType.EntryUiNode:
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
    default:
      return defaultBodyNodeTypeProps(type, nodes);
  }
}
