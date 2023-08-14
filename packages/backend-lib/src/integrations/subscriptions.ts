import { EMAIL_EVENTS_UP_NAME, HUBSPOT_INTEGRATION } from "../constants";

export const INTEGRATION_SUBSCRIBED_USER_PROPERTIES = new Map<
  string,
  Set<string>
>([[HUBSPOT_INTEGRATION, new Set([EMAIL_EVENTS_UP_NAME])]]);
