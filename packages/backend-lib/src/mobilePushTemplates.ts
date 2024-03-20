import { findMessageTemplates } from "./messaging";
import { ChannelType, MessageTemplateResource } from "./types";

export async function getMobilePushTemplates({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<MessageTemplateResource[]> {
  const templates = await findMessageTemplates({
    workspaceId,
  });
  return templates.filter((template) => {
    const definition = template.draft ?? template.definition ?? null;
    return definition && definition.type === ChannelType.MobilePush;
  });
}
