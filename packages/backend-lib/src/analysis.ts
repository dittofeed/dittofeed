export interface MessageStats {}

export async function getChartData({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<MessageStats> {
  throw new Error("Not implemented");
}

export async function getSummarizedData({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<MessageStats> {
  throw new Error("Not implemented");
}
