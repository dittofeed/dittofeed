import backendConfig from "backend-lib/src/config";
import { CompletionStatus, DFRequestContext } from "isomorphic-lib/src/types";

import AppsApi from "./appsApi";
import { AppState, PropsWithInitialState } from "./types";

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
  const {
    sourceControlProvider,
    enableSourceControl,
    signoutUrl,
    trackDashboard,
    dashboardWriteKey,
  } = backendConfig();

  const apiBase = process.env.DASHBOARD_API_BASE ?? "http://localhost:3001";
  const stateWithEnvVars: Partial<AppState> = clone({
    apiBase: process.env.DASHBOARD_API_BASE ?? "http://localhost:3001",
    sourceControlProvider,
    enableSourceControl,
    ...serverInitialState,
    workspace: {
      type: CompletionStatus.Successful,
      value: dfContext.workspace,
    },
    member: dfContext.member,
    signoutUrl,
    trackDashboard,
    dashboardWriteKey,
  });

  const appsApi = new AppsApi({
    workspace: {
      type: CompletionStatus.Successful,
      value: dfContext.workspace,
    },
    trackDashboard,
    dashboardWriteKey,
    apiBase,
  });
  void appsApi.identify({
    userId: dfContext.member.id,
    traits: {
      email: dfContext.member.email,
      firstName: dfContext.member.name,
      nickname: dfContext.member.nickname,
    },
  });

  return {
    ...props,
    // the "stringify and then parse again" piece is required as next.js
    // isn't able to serialize it to JSON properly
    serverInitialState: stateWithEnvVars,
  };
}
