import { JourneyNodeType } from "isomorphic-lib/src/types";

import { AdditionalJourneyNodeType, NodeTypeProps } from "../../lib/types";

export default function journeyNodeLabel(t: NodeTypeProps["type"]): string {
  switch (t) {
    case JourneyNodeType.DelayNode:
      return "Delay";
    case AdditionalJourneyNodeType.UiEntryNode:
      return "Entry";
    case JourneyNodeType.ExitNode:
      return "Exit";
    case JourneyNodeType.SegmentSplitNode:
      return "Segment Split";
    case JourneyNodeType.MessageNode:
      return "Message";
    case JourneyNodeType.WaitForNode:
      return "Wait For";
  }
}
