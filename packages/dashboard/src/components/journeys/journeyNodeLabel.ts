import { JourneyNodeType } from "isomorphic-lib/src/types";

export default function journeyNodeLabel(t: JourneyNodeType): string {
  switch (t) {
    case JourneyNodeType.DelayNode:
      return "Delay";
    case JourneyNodeType.EntryNode:
      return "Entry";
    case JourneyNodeType.ExperimentSplitNode:
      return "Experiment Split";
    case JourneyNodeType.RateLimitNode:
      return "Rate Limit";
    case JourneyNodeType.ExitNode:
      return "Exit";
    case JourneyNodeType.SegmentSplitNode:
      return "Segment Split";
    case JourneyNodeType.MessageNode:
      return "Message";
  }
}
