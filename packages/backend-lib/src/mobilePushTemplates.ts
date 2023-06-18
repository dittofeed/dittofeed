import { findMessageTemplates } from "./messageTemplates";
import { MessageTemplateResource, TemplateResourceType } from "./types";

export async function getMobilePushTemplates({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<MessageTemplateResource[]> {
  const templates = await findMessageTemplates({
    workspaceId,
  });
  return templates.filter(
    (template) => template.definition.type === TemplateResourceType.MobilePush
  );
}
