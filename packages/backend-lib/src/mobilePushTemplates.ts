import { findMessageTemplates } from "./messageTemplates";
import { ChannelType, MessageTemplateResource } from "./types";

export async function getMobilePushTemplates({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<MessageTemplateResource[]> {
  const templates = await findMessageTemplates({
    workspaceId,
  });
  return templates.filter(
    (template) => template.definition.type === ChannelType.MobilePush
  );
}
