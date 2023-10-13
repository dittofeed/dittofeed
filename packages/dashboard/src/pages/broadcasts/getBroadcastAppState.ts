import { BroadcastResource } from "isomorphic-lib/src/types";

import { AppState } from "../../lib/types";

export function getBroadcastAppState({
  broadcast,
}: {
  broadcast: BroadcastResource;
}): Partial<AppState> {
  const appState: Partial<AppState> = {};
  appState.editedBroadcast = broadcast;
  return appState;
}
