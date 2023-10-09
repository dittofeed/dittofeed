import { BroadcastResource } from "isomorphic-lib/src/types";

import { AppState } from "../../lib/types";

export function getBroadcastAppState({
  broadcast,
}: {
  broadcast: BroadcastResource;
}): Partial<AppState> {
  const appState: Partial<AppState> = {};

  appState.editedBroadcast = {
    id: broadcast.id,
    name: broadcast.name,
    workspaceId: broadcast.workspaceId,
    segmentId: broadcast.segmentId ?? undefined,
    createdAt: broadcast.createdAt,
    triggeredAt: broadcast.triggeredAt,
  };

  return appState;
}
