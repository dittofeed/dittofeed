import { IntegrationCreateDefinition, IntegrationType } from "./types";

export const HUBSPOT_OAUTH_TOKEN = "hubspot" as const;
export const HUBSPOT_INTEGRATION = "hubspot" as const;
export const EMAIL_EVENTS_UP_NAME = "DFEmailEvents" as const;
export const DEFAULT_WRITE_KEY_NAME = "default-write-key" as const;

export const HUBSPOT_INTEGRATION_DEFINITION: IntegrationCreateDefinition = {
  name: HUBSPOT_INTEGRATION,
  definition: {
    type: IntegrationType.Sync,
    subscribedUserProperties: [EMAIL_EVENTS_UP_NAME],
    subscribedSegments: [],
  },
};

export const FEATURE_INCREMENTAL_COMP = "incremental-comp" as const;

export const WORKSPACE_COMPUTE_LATENCY_METRIC =
  "workspace_compute_latency" as const;

export const MESSAGE_METADATA_FIELDS = [
  "workspaceId",
  "journeyId",
  "runId",
  "messageId",
  "userId",
  "templateId",
  "nodeId",
] as const;

export const WORKSPACE_OCCUPANT_SETTINGS_NAMES = {
  GmailTokens: "GmailTokens",
} as const;

export const QUEUE_ITEM_PRIORITIES = {
  Split: 10,
  Ui: 20,
};
