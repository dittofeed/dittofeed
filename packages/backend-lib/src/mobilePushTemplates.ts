import { randomUUID } from "crypto";

import { MobilePushTemplateResource, TemplateResourceType } from "./types";

export async function getMobilePushTemplates({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<MobilePushTemplateResource[]> {
  return [
    {
      type: TemplateResourceType.MobilePush,
      name: "Hello",
      id: randomUUID(),
      workspaceId,
      message: "Hello, {{user.firstName}}!",
      title: "Hello",
    },
  ];
}
