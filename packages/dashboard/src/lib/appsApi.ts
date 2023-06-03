import axios from "axios";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import { CompletionStatus, IdentifyData } from "isomorphic-lib/src/types";

import { AppState } from "./types";

export type AppsConfig = Pick<
  AppState,
  "trackDashboard" | "dashboardWriteKey" | "apiBase" | "workspace"
>;

interface AppsConfigInternal {
  apiBase: string;
  workspaceId: string;
  dashboardWriteKey: string;
}

export default class AppsApi {
  private config: AppsConfigInternal | null = null;

  constructor({
    trackDashboard,
    dashboardWriteKey,
    apiBase,
    workspace,
  }: AppsConfig) {
    if (
      !trackDashboard ||
      workspace.type !== CompletionStatus.Successful ||
      dashboardWriteKey === undefined
    ) {
      return;
    }

    this.config = {
      apiBase,
      workspaceId: workspace.value.id,
      dashboardWriteKey,
    };
  }

  async identify(data: IdentifyData): Promise<void> {
    if (!this.config) {
      return;
    }
    await axios({
      method: "post",
      url: `${this.config.apiBase}/api/public/apps/identify`,
      data,
      headers: {
        [WORKSPACE_ID_HEADER]: this.config.workspaceId,
        authorization: this.config.dashboardWriteKey,
      },
    });
  }
}
