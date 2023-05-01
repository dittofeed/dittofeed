import backendConfig from "backend-lib/src/config";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { AppState, DFRequestContext, PropsWithInitialState } from "./types";

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function addInitialStateToProps<
  T extends Record<string, unknown> = Record<string, never>
>({
  props,
  serverInitialState,
  dfContext,
}: {
  props: T;
  serverInitialState: Partial<AppState>;
  dfContext: DFRequestContext;
}): T & PropsWithInitialState {
  const { sourceControlProvider, enableSourceControl } = backendConfig();

  const stateWithEnvVars: Partial<AppState> = clone({
    apiBase: process.env.DASHBOARD_API_BASE ?? "http://localhost:3001",
    sourceControlProvider,
    enableSourceControl,
    ...serverInitialState,
    workspace: {
      type: CompletionStatus.Successful,
      value: dfContext.workspace,
    },
  });
  return {
    ...props,
    // the "stringify and then parse again" piece is required as next.js
    // isn't able to serialize it to JSON properly
    serverInitialState: stateWithEnvVars,
  };
}
