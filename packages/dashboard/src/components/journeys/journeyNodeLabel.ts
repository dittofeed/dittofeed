import { JourneyNodeType } from "isomorphic-lib/src/types";

import {
  AdditionalJourneyNodeType,
  JourneyUiNodeTypeProps,
} from "../../lib/types";

export default function journeyNodeLabel(
  t: JourneyUiNodeTypeProps["type"],
): string {
  switch (t) {
    case JourneyNodeType.DelayNode:
      return "Delay";
    case AdditionalJourneyNodeType.EntryUiNode:
      return "Entry";
    case JourneyNodeType.ExitNode:
      return "Exit";
    case JourneyNodeType.SegmentSplitNode:
      return "Segment Split";
    case JourneyNodeType.MessageNode:
      return "Message";
    case JourneyNodeType.WaitForNode:
      return "Wait For";
    case JourneyNodeType.RandomCohortNode:
      return "Random Cohort";
  }
}
