export async function appendToManualSegment({
  workspaceId,
  segmentId,
  userIds,
}: {
  workspaceId: string;
  segmentId: string;
  userIds: string[];
}): Promise<void> {
  throw new Error("Not implemented");
}

export async function replaceManualSegment({
  workspaceId,
  segmentId,
  userIds,
}: {
  workspaceId: string;
  segmentId: string;
  userIds: string[];
}): Promise<void> {
  throw new Error("Not implemented");
}

export async function clearManualSegment({
  workspaceId,
  segmentId,
}: {
  workspaceId: string;
  segmentId: string;
}): Promise<void> {
  throw new Error("Not implemented");
}
