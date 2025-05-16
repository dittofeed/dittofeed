export async function updateManualSegmentUsers({
  workspaceId,
  segmentId,
  userIds,
}: {
  workspaceId: string;
  segmentId: string;
  userIds: string[];
  append: boolean;
}): Promise<void> {
  throw new Error("Not implemented");
}
