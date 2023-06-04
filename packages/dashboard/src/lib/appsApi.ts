import axios from "axios";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import {
  BatchAppData,
  BatchItem,
  CompletionStatus,
  IdentifyData,
  KnownIdentifyData,
  KnownPageData,
  KnownScreenData,
  KnownTrackData,
} from "isomorphic-lib/src/types";
import { v4 as uuidv4 } from "uuid";

import { BatchQueue } from "./batchQueue";
import { AppState } from "./types";

export type AppsConfig = Pick<
  AppState,
  "trackDashboard" | "dashboardWriteKey" | "apiBase" | "workspace"
> & { queue?: BatchQueue<BatchItem> };

interface AppsConfigInternal {
  apiBase: string;
  workspaceId: string;
  dashboardWriteKey: string;
}

// FIXME make operations asynchronous, and queue them up, then provide a flush operation
// want to make this a singleton, but need to figure out how to get singletons on a request by request basis
// maybe can just make the the actual queue async, but the config surrounding it and the client can take it as an argument
export default class AppsApi {
  static globalQueue: BatchQueue<BatchItem> | null = null;

  instanceQueue: BatchQueue<BatchItem> | null = null;

  config: AppsConfigInternal | null = null;

  constructor({
    trackDashboard,
    dashboardWriteKey,
    apiBase,
    workspace,
    queue,
  }: AppsConfig) {
    if (
      !trackDashboard ||
      workspace.type !== CompletionStatus.Successful ||
      dashboardWriteKey === undefined
    ) {
      return;
    }

    const config = {
      apiBase,
      workspaceId: workspace.value.id,
      dashboardWriteKey,
    };

    this.instanceQueue =
      queue ??
      AppsApi.globalQueue ??
      new BatchQueue<BatchItem>({
        executeBatch: async (batch) => {
          const data: BatchAppData = {
            batch,
          };

          await axios({
            method: "post",
            url: `${config.apiBase}/api/public/apps/identify`,
            data,
            headers: {
              [WORKSPACE_ID_HEADER]: config.workspaceId,
              authorization: config.dashboardWriteKey,
            },
          });
        },
      });

    if (!AppsApi.globalQueue) {
      AppsApi.globalQueue = this.instanceQueue;
    }
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

  async track(params: Omit<KnownTrackData, "messageId">): Promise<void> {
    if (!this.config) {
      return;
    }
    const data: KnownTrackData = {
      messageId: uuidv4(),
      ...params,
    };
    await axios({
      method: "post",
      url: `${this.config.apiBase}/api/public/apps/track`,
      data,
      headers: {
        [WORKSPACE_ID_HEADER]: this.config.workspaceId,
        authorization: this.config.dashboardWriteKey,
      },
    });
  }

  async page(params: Omit<KnownPageData, "messageId">): Promise<void> {
    if (!this.config) {
      return;
    }
    const data: KnownPageData = {
      messageId: uuidv4(),
      ...params,
    };
    await axios({
      method: "post",
      url: `${this.config.apiBase}/api/public/apps/page`,
      data,
      headers: {
        [WORKSPACE_ID_HEADER]: this.config.workspaceId,
        authorization: this.config.dashboardWriteKey,
      },
    });
  }

  async screen(params: Omit<KnownScreenData, "messageId">): Promise<void> {
    if (!this.config) {
      return;
    }
    const data: KnownScreenData = {
      messageId: uuidv4(),
      ...params,
    };
    await axios({
      method: "post",
      url: `${this.config.apiBase}/api/public/apps/screen`,
      data,
      headers: {
        [WORKSPACE_ID_HEADER]: this.config.workspaceId,
        authorization: this.config.dashboardWriteKey,
      },
    });
  }
}
