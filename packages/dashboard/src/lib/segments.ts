import { DEFAULT_SEGMENT_DEFINITION } from "backend-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  MessageTemplateResource,
  SegmentDefinition,
  SegmentResource,
  SubscriptionGroupResource,
} from "isomorphic-lib/src/types";

import { AppState } from "./types";

export function getSegmentConfigState({
  workspaceId,
  segment,
  segmentId: id,
  messageTemplates,
  traits,
  subscriptionGroups,
}: {
  workspaceId: string;
  segmentId: string;
  messageTemplates: MessageTemplateResource[];
  subscriptionGroups: SubscriptionGroupResource[];
  traits: string[];
  segment: SegmentResource | null;
}): Partial<AppState> {
  const serverInitialState: Partial<AppState> = {};

  serverInitialState.messages = {
    type: CompletionStatus.Successful,
    value: messageTemplates,
  };

  let segmentResource: SegmentResource;
  if (segment && segment.workspaceId === workspaceId) {
    const segmentDefinition = unwrap(
      schemaValidateWithErr(segment.definition, SegmentDefinition)
    );
    segmentResource = {
      id: segment.id,
      name: segment.name,
      workspaceId,
      definition: segmentDefinition,
    };

    serverInitialState.segments = {
      type: CompletionStatus.Successful,
      value: [segmentResource],
    };
  } else {
    segmentResource = {
      name: `My Segment - ${id}`,
      id,
      workspaceId,
      definition: DEFAULT_SEGMENT_DEFINITION,
    };
  }
  serverInitialState.editedSegment = segmentResource;
  serverInitialState.subscriptionGroups = subscriptionGroups;

  serverInitialState.traits = {
    type: CompletionStatus.Successful,
    value: traits,
  };
  return serverInitialState;
}
