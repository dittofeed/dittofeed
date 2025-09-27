import { Node } from "@xyflow/react";
import { getDefaultSubscriptionGroup } from "isomorphic-lib/src/subscriptionGroups";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  DelayVariantType,
  JourneyNodeType,
  JourneyUiBodyNodeTypeProps,
  SavedSubscriptionGroupResource,
} from "isomorphic-lib/src/types";
import { v4 as uuid } from "uuid";

import {
  AdditionalJourneyNodeType,
  JourneyNodeUiProps,
  JourneyUiNodeTypeProps,
} from "../../../lib/types";

export const defaultSegmentSplitName = "True / False Branch";

export interface DefaultNodeTypeProps {
  type: JourneyUiNodeTypeProps["type"];
  nodes: Node<JourneyNodeUiProps>[];
  subscriptionGroups: SavedSubscriptionGroupResource[];
}

export function defaultBodyNodeTypeProps({
  type,
  nodes: _nodes,
  subscriptionGroups,
}: {
  type: JourneyUiNodeTypeProps["type"];
  nodes: Node<JourneyNodeUiProps>[];
  subscriptionGroups: SavedSubscriptionGroupResource[];
}): JourneyUiBodyNodeTypeProps {
  switch (type) {
    case JourneyNodeType.MessageNode: {
      const defaultSubscriptionGroup = getDefaultSubscriptionGroup({
        subscriptionGroups,
        channel: ChannelType.Email,
      });
      return {
        type,
        channel: ChannelType.Email,
        name: "",
        subscriptionGroupId: defaultSubscriptionGroup?.id,
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
    case JourneyNodeType.RandomCohortNode:
      return {
        type,
        name: "Random Cohort Split",
        cohortChildren: [
          {
            id: uuid(),
            percent: 50,
            labelNodeId: uuid(),
          },
          {
            id: uuid(),
            percent: 50,
            labelNodeId: uuid(),
          },
        ],
      };
    case AdditionalJourneyNodeType.EntryUiNode:
      throw new Error(
        "EntryUiNode should not be handled by defaultBodyNodeTypeProps",
      );
    case JourneyNodeType.ExitNode:
      throw new Error(
        "ExitUiNode should not be handled by defaultBodyNodeTypeProps",
      );
    default: {
      const t: never = type;
      assertUnreachable(t);
    }
  }
}

export function defaultNodeTypeProps(
  props: DefaultNodeTypeProps,
): JourneyUiNodeTypeProps {
  const { type } = props;
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
      return defaultBodyNodeTypeProps(props);
  }
}
