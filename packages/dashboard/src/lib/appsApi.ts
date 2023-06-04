import axios from "axios";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import {
  CompletionStatus,
  IdentifyData,
  KnownIdentifyData,
} from "isomorphic-lib/src/types";
import { v4 as uuidv4 } from "uuid";

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

  async identify(params: Omit<KnownIdentifyData, "messageId">): Promise<void> {
    if (!this.config) {
      return;
    }
    const data: IdentifyData = {
      messageId: uuidv4(),
      ...params,
    };
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
