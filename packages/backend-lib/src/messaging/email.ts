import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import {
  BadWorkspaceConfigurationType,
  MessageTemplateRenderError,
  SubscriptionChange,
} from "isomorphic-lib/src/types";
import { err, ok, Result } from "neverthrow";

import { generateSubscriptionChangeUrl } from "../subscriptionGroups";

const LIST_UNSUBSCRIBE_POST = "List-Unsubscribe=One-Click" as const;

export interface UnsubscribeHeaders {
  "List-Unsubscribe-Post": typeof LIST_UNSUBSCRIBE_POST;
  "List-Unsubscribe": string;
  "List-ID": string;
}

export function constructUnsubscribeHeaders({
  to,
  from,
  userId,
  subscriptionGroupSecret,
  subscriptionGroupName,
  workspaceId,
  subscriptionGroupId,
}: {
  to: string;
  from: string;
  userId: string;
  subscriptionGroupSecret: string;
  subscriptionGroupName: string;
  workspaceId: string;
  subscriptionGroupId: string;
}): Result<UnsubscribeHeaders, MessageTemplateRenderError> {
  const domain = from.split("@")[1];
  if (!domain) {
    return err({
      type: BadWorkspaceConfigurationType.MessageTemplateRenderError,
      field: "from",
      error: `Invalid from address ${from}`,
    });
  }
  const url = generateSubscriptionChangeUrl({
    workspaceId,
    identifier: to,
    identifierKey: CHANNEL_IDENTIFIERS.Email,
    subscriptionSecret: subscriptionGroupSecret,
    userId,
    changedSubscription: subscriptionGroupId,
    subscriptionChange: SubscriptionChange.Unsubscribe,
  });
  return ok({
    "List-Unsubscribe-Post": LIST_UNSUBSCRIBE_POST,
    "List-Unsubscribe": `<${url}>`,
    "List-ID": `${subscriptionGroupName} <${subscriptionGroupId}.${domain}>`,
  });
}
