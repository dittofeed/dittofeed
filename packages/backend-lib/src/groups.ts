export async function getUsersForGroup({
  workspaceId,
  groupId,
  limit,
  offset,
}: {
  workspaceId: string;
  groupId: string;
  limit?: number;
  offset?: number;
}): Promise<string[]> {
  throw new Error("Not implemented");
}

export async function getGroupsForUser({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<string[]> {
  throw new Error("Not implemented");
}
