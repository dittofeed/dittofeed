import { ChannelType, SmsTemplateResource } from "./types";

export function defaultSmsDefinition(): SmsTemplateResource {
  return {
    type: ChannelType.Sms,
    body: "Example message to {{ user.phone }}",
  };
}
