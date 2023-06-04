import axios from "axios";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import {
  BatchAppData,
  BatchIdentifyData,
  BatchItem,
  CompletionStatus,
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

          console.log("submitting batch", data);
          if (process.env.NEXT_RUNTIME === "nodejs") {
            console.log("submitting batch to backend");
            const { submitBatch } = await import("backend-lib/src/apps");
            await submitBatch({ workspaceId: workspace.value.id, data });
          } else {
            console.log("submitting batch to api");
            await axios({
              method: "post",
              url: `${config.apiBase}/api/public/apps/batch`,
              data,
              headers: {
                [WORKSPACE_ID_HEADER]: config.workspaceId,
                authorization: config.dashboardWriteKey,
              },
            });
          }
        },
      });

    console.log("instanceQueue", this.instanceQueue);
    if (!AppsApi.globalQueue) {
      AppsApi.globalQueue = this.instanceQueue;
    }
  }

  async identify(params: Omit<KnownIdentifyData, "messageId">): Promise<void> {
    const data: BatchIdentifyData = {
      messageId: uuidv4(),
      type: "identify",
      ...params,
    };
    this.instanceQueue?.submit(data);
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
