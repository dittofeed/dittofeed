import * as wf from "@temporalio/workflow";
import { LoggerSinks, proxyActivities, proxySinks } from "@temporalio/workflow";

import type * as activities from "../temporal/activities";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

const {
  updateDownloadStatus,
  generateDownloadFile,
  generatePresignedDownloadUrl,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
  retry: {
    initialInterval: "1 second",
    maximumAttempts: 3,
  },
});

export function generateCsvDownloadWorkflowId(downloadId: string): string {
  return `csv-download-${downloadId}`;
}

export interface CsvDownloadWorkflowParams {
  downloadId: string;
  workspaceId: string;
  downloadType: string;
}

export async function csvDownloadWorkflow({
  downloadId,
  workspaceId,
  downloadType,
}: CsvDownloadWorkflowParams): Promise<void> {
  logger.info("Starting CSV download workflow", {
    downloadId,
    workspaceId,
    downloadType,
  });

  try {
    await updateDownloadStatus({
      downloadId,
      status: "PROCESSING",
    });

    const { blobStorageKey } = await generateDownloadFile({
      downloadId,
      workspaceId,
      downloadType,
    });

    const { downloadUrl } = await generatePresignedDownloadUrl({
      downloadId,
      blobStorageKey,
    });

    await updateDownloadStatus({
      downloadId,
      status: "COMPLETE",
      blobStorageKey,
      downloadUrl,
    });

    logger.info("CSV download workflow completed successfully", {
      downloadId,
      workspaceId,
      downloadType,
    });
  } catch (error) {
    logger.error("CSV download workflow failed", {
      downloadId,
      workspaceId,
      downloadType,
      err: error,
    });

    await updateDownloadStatus({
      downloadId,
      status: "FAILED",
      error: error instanceof Error ? error.message : "Unknown error",
    });

    throw error;
  }
}
