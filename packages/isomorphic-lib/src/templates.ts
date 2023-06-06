import {
  EmailTemplateResource,
  MessageTemplateResource,
  TemplateResourceType,
} from "./types";

export function isEmailTemplate(
  template: MessageTemplateResource
): template is EmailTemplateResource {
  return template.type === TemplateResourceType.Email;
}
