import backendConfig from "backend-lib/src/config";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { apiBase } from "./apiBase";
import { AppState, DashboardContext, PropsWithInitialState } from "./types";

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function addInitialStateToProps<
  T extends Record<string, unknown> = Record<string, never>,
>(params: {
  props: T;
  serverInitialState?: Partial<AppState>;
  dfContext: DashboardContext;
}): T & PropsWithInitialState {
  const { props, serverInitialState, dfContext } = params;
  const effectiveServerInitialState = serverInitialState ?? {};

  const {
    sourceControlProvider,
    enableSourceControl,
    signoutUrl,
    trackDashboard,
    dashboardWriteKey,
    enableMobilePush,
    dashboardUrl,
    enableAdditionalDashboardSettings,
    additionalDashboardSettingsPath,
    additionalDashboardSettingsTitle,
    gmailClientId,
    authMode,
  } = backendConfig();

  const stateWithEnvVars: Partial<AppState> = clone<Partial<AppState>>({
    apiBase: apiBase(),
    dashboardUrl,
    sourceControlProvider,
    enableSourceControl,
    ...effectiveServerInitialState,
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
    enableAdditionalDashboardSettings,
    additionalDashboardSettingsPath,
    additionalDashboardSettingsTitle,
    gmailClientId,
    authMode,
  });

  console.log("stateWithEnvVars", stateWithEnvVars);
  return {
    ...props,
    // the "stringify and then parse again" piece is required as next.js
    // isn't able to serialize it to JSON properly
    serverInitialState: stateWithEnvVars,
  };
}
