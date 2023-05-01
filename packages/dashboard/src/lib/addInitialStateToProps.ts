import backendConfig from "backend-lib/src/config";

import { AppState, PropsWithInitialState } from "./types";

export function addInitialStateToProps<T>(
  props: T,
  serverInitialState: Partial<AppState>
): T & PropsWithInitialState {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  const { sourceControlProvider, enableSourceControl } = backendConfig();
  const stateWithEnvVars: Partial<AppState> = {
    apiBase: process.env.DASHBOARD_API_BASE ?? "http://localhost:3001",
    sourceControlProvider,
    enableSourceControl,
    ...serverInitialState,
  };
  return {
    ...props,
    // the "stringify and then parse again" piece is required as next.js
    // isn't able to serialize it to JSON properly
    serverInitialState: JSON.parse(JSON.stringify(stateWithEnvVars)),
  };
}
