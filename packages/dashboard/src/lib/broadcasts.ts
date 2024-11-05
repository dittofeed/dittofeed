import {
  CompletionStatus,
  JourneyNodeType,
  MessageNode,
} from "isomorphic-lib/src/types";

import { AppState } from "./types";

export function getBroadcastMessageNode(
  journeyId: string,
  journeys: AppState["journeys"],
): MessageNode | null {
  if (journeys.type !== CompletionStatus.Successful) {
    return null;
  }
  const journey = journeys.value.find((j) => j.id === journeyId);
  if (!journey || !journey.definition) {
    return null;
  }
  let messageNode: MessageNode | null = null;
  for (const node of journey.definition.nodes) {
    if (node.type === JourneyNodeType.MessageNode) {
      messageNode = node;
      break;
    }
  }
  return messageNode;
}
