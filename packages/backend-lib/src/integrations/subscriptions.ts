import { EMAIL_EVENTS_UP_NAME, HUBSPOT_INTEGRATION } from "../constants";
import {
  EmailEventList,
  InternalEventType,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
} from "../types";

export const INTEGRATION_SUBSCRIBED_USER_PROPERTIES = new Map<
  string,
  Set<string>
>([[HUBSPOT_INTEGRATION, new Set([EMAIL_EVENTS_UP_NAME])]]);

export const EMAIL_EVENTS_UP_DEFINITION: UserPropertyDefinition = {
  type: UserPropertyDefinitionType.PerformedMany,
  or: [
    {
      event: InternalEventType.MessageFailure,
    },
    ...EmailEventList.map((event) => ({
      event,
    })),
  ],
};
