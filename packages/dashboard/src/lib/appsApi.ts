import axios from "axios";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import {
  BatchAppData,
  BatchIdentifyData,
  BatchItem,
  BatchPageData,
  BatchScreenData,
  BatchTrackData,
  CompletionStatus,
  EventType,
  KnownIdentifyData,
  KnownPageData,
  KnownScreenData,
  KnownTrackData,
} from "isomorphic-lib/src/types";
import { v4 as uuidv4 } from "uuid";

import { BatchFunction, BatchQueue } from "./batchQueue";
import { AppState } from "./types";

export type AppsConfig = Pick<
  AppState,
  "trackDashboard" | "dashboardWriteKey" | "apiBase" | "workspace"
> & { queue?: BatchQueue<BatchItem> };

export default class AppsApi {
  static globalQueue: BatchQueue<BatchItem> | null = null;

  instanceQueue: BatchQueue<BatchItem> | null = null;

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

    if (queue) {
      this.instanceQueue = queue;
    } else if (AppsApi.globalQueue) {
      this.instanceQueue = AppsApi.globalQueue;
    } else {
      const executeBatch: BatchFunction<BatchItem> =
        async function executeBatch(batch) {
          const data: BatchAppData = {
            batch,
          };

          if (process.env.NEXT_RUNTIME === "nodejs") {
            const { submitBatch } = await import("backend-lib/src/apps");
            await submitBatch({ workspaceId: workspace.value.id, data });
          } else {
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
        };
      this.instanceQueue = new BatchQueue<BatchItem>({ executeBatch });
    }

    if (!AppsApi.globalQueue) {
      AppsApi.globalQueue = this.instanceQueue;
    }
  }

  async identify(params: Omit<KnownIdentifyData, "messageId">): Promise<void> {
    const data: BatchIdentifyData = {
      messageId: uuidv4(),
      type: EventType.Identify,
      ...params,
    };
    this.instanceQueue?.submit(data);
  }

  async track(params: Omit<KnownTrackData, "messageId">): Promise<void> {
    const data: BatchTrackData = {
      messageId: uuidv4(),
      type: EventType.Track,
      ...params,
    };
    this.instanceQueue?.submit(data);
  }

  async page(params: Omit<KnownPageData, "messageId">): Promise<void> {
    const data: BatchPageData = {
      messageId: uuidv4(),
      type: EventType.Page,
      ...params,
    };
    this.instanceQueue?.submit(data);
  }

  async screen(params: Omit<KnownScreenData, "messageId">): Promise<void> {
    const data: BatchScreenData = {
      messageId: uuidv4(),
      type: EventType.Screen,
      ...params,
    };
    this.instanceQueue?.submit(data);
  }
}
