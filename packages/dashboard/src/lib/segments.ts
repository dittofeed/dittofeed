import { DEFAULT_SEGMENT_DEFINITION } from "backend-lib/src/constants";
import {
  CompletionStatus,
  MessageTemplateResource,
  SavedSegmentResource,
  SavedSubscriptionGroupResource,
  SegmentResource,
} from "isomorphic-lib/src/types";

import { AppState } from "./types";

export function getSegmentConfigState({
  workspaceId,
  segment,
  segmentId: id,
  messageTemplates,
  name,
  subscriptionGroups,
}: {
  workspaceId: string;
  segmentId: string;
  name?: string;
  messageTemplates: MessageTemplateResource[];
  subscriptionGroups: SavedSubscriptionGroupResource[];
  segment: SavedSegmentResource | null;
}): Partial<AppState> {
  const serverInitialState: Partial<AppState> = {};

  serverInitialState.messages = {
    type: CompletionStatus.Successful,
    value: messageTemplates,
  };

  let segmentResource: SegmentResource;
  if (segment && segment.workspaceId === workspaceId) {
    serverInitialState.segments = {
      type: CompletionStatus.Successful,
      value: [segment],
    };
    segmentResource = segment;
  } else {
    segmentResource = {
      name: name ?? `My Segment - ${id}`,
      id,
      workspaceId,
      definition: DEFAULT_SEGMENT_DEFINITION,
      updatedAt: Number(new Date()),
    };
  }
  serverInitialState.editedSegment = segmentResource;
  serverInitialState.subscriptionGroups = subscriptionGroups;

  return serverInitialState;
}
