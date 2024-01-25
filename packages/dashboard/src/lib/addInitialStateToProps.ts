import backendConfig from "backend-lib/src/config";
import { CompletionStatus, DFRequestContext } from "isomorphic-lib/src/types";

import { apiBase } from "./apiBase";
import { AppState, PropsWithInitialState } from "./types";

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function addInitialStateToProps<
  T extends Record<string, unknown> = Record<string, never>,
>({
  props,
  serverInitialState,
  dfContext,
}: {
  props: T;
  serverInitialState: Partial<AppState>;
  dfContext: DFRequestContext;
}): T & PropsWithInitialState {
  const {
    sourceControlProvider,
    enableSourceControl,
    signoutUrl,
    trackDashboard,
    dashboardWriteKey,
    enableMobilePush,
    dashboardUrl,
  } = backendConfig();

  const stateWithEnvVars: Partial<AppState> = clone<Partial<AppState>>({
    apiBase: apiBase(),
    dashboardUrl,
    sourceControlProvider,
    enableSourceControl,
    ...serverInitialState,
    workspace: {
      type: CompletionStatus.Successful,
      value: dfContext.workspace,
    },
    member: dfContext.member,
    memberRoles: dfContext.memberRoles,
    signoutUrl,
    trackDashboard,
    dashboardWriteKey,
    enableMobilePush,
  });

  return {
    ...props,
    // the "stringify and then parse again" piece is required as next.js
    // isn't able to serialize it to JSON properly
    serverInitialState: stateWithEnvVars,
  };
}
