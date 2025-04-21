import {
  CompletionStatus,
  MessageTemplateResource,
  SavedSubscriptionGroupResource,
} from "isomorphic-lib/src/types";

import { AppState } from "./types";

export function getSegmentConfigState({
  messageTemplates,
  subscriptionGroups,
}: {
  messageTemplates: MessageTemplateResource[];
  subscriptionGroups: SavedSubscriptionGroupResource[];
}): Partial<AppState> {
  const serverInitialState: Partial<AppState> = {};

  serverInitialState.messages = {
    type: CompletionStatus.Successful,
    value: messageTemplates,
  };

  serverInitialState.subscriptionGroups = subscriptionGroups;

  return serverInitialState;
}
