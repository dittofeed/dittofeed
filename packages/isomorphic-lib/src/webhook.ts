import { ChannelType, WebhookTemplateResource } from "./types";

export const DEFAULT_WEBHOOK_BODY = `{
  "config": {
    "url": "https://httpbin.org/post",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "data": {}
  },
  "secret": {
    "headers": {}
  }
}`;

export const DEFAULT_WEBHOOK_DEFINITION: WebhookTemplateResource = {
  type: ChannelType.Webhook,
  identifierKey: "email",
  body: DEFAULT_WEBHOOK_BODY,
};
