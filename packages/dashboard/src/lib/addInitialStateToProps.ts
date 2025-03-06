import backendConfig from "backend-lib/src/config";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { apiBase } from "./apiBase";
import { AppState, DashboardContext, PropsWithInitialState } from "./types";

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
  dfContext: DashboardContext;
}): T & PropsWithInitialState {
  const {
    sourceControlProvider,
    enableSourceControl,
    signoutUrl,
    trackDashboard,
    dashboardWriteKey,
    enableMobilePush,
    dashboardUrl,
    // FIXME use config to show cloud settings
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
    features: dfContext.features,
  });

  return {
    ...props,
    // the "stringify and then parse again" piece is required as next.js
    // isn't able to serialize it to JSON properly
    serverInitialState: stateWithEnvVars,
  };
}
