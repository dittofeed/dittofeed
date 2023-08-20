import { IntegrationCreateDefinition } from "./types";

export const HUBSPOT_OAUTH_TOKEN = "hubspot" as const;
export const HUBSPOT_INTEGRATION = "hubspot" as const;
export const EMAIL_EVENTS_UP_NAME = "email-events" as const;

export const HUBSPOT_INTEGRATION_DEFINITION: IntegrationCreateDefinition = {
  name: HUBSPOT_INTEGRATION,
  definition: {
    subscribedUserProperties: [EMAIL_EVENTS_UP_NAME],
    subscribedSegments: [],
  },
};
