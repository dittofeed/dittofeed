import { Broadcast, BroadcastResourceV2 } from "../types";

export async function getTimezones(): Promise<
  {
    name: string;
    offset: number;
  }[]
> {}

export async function sendMessages({
  workspaceId,
  cursor,
  timezone,
  limit,
}: {
  workspaceId: string;
  timezone?: string;
  cursor?: string;
  limit: number;
}): Promise<{
  nextCursor?: string;
}> {
  return {};
}

export async function computeTimezones({
  workspaceId,
  defaultTimezone,
}: {
  workspaceId: string;
  defaultTimezone?: string;
}) {
  throw new Error("Not implemented");
}

export async function getBroadcast({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}): Promise<BroadcastResourceV2> {
  throw new Error("Not implemented");
}
