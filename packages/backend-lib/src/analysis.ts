export interface MessageStats {}

export async function getMessageStats({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<MessageStats> {
  throw new Error("Not implemented");
}
