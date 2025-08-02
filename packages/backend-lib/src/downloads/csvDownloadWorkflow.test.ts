import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";

import { createEnvAndWorker } from "../../test/temporal";
import { csvDownloadWorkflow } from "./csvDownloadWorkflow";

describe("csvDownloadWorkflow", () => {
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  const mockUpdateDownloadStatus = jest.fn().mockResolvedValue(undefined);
  const mockGenerateDownloadFile = jest.fn();
  const mockGeneratePresignedDownloadUrl = jest.fn().mockResolvedValue({
    downloadUrl: "https://example.com/presigned-url",
  });

  const testActivities = {
    updateDownloadStatus: mockUpdateDownloadStatus,
    generateDownloadFile: mockGenerateDownloadFile,
    generatePresignedDownloadUrl: mockGeneratePresignedDownloadUrl,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const envAndWorker = await createEnvAndWorker({
      activityOverrides: testActivities,
    });
    testEnv = envAndWorker.testEnv;
    worker = envAndWorker.worker;
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  test("should complete successfully for segments download", async () => {
    const downloadId = randomUUID();
    const workspaceId = randomUUID();
    const downloadType = "segments";

    mockGenerateDownloadFile.mockResolvedValue({
      blobStorageKey: `downloads/${downloadType}/${downloadId}.csv`,
    });

    await worker.runUntil(async () => {
      const result = await testEnv.client.workflow.execute(csvDownloadWorkflow, {
        taskQueue: "default",
        workflowId: `test-${downloadId}`,
        args: [
          {
            downloadId,
            workspaceId,
            downloadType,
          },
        ],
      });

      // Verify the workflow completed without throwing
      expect(result).toBeUndefined();

      // Verify activity calls
      expect(mockUpdateDownloadStatus).toHaveBeenCalledWith({
        downloadId,
        status: "PROCESSING",
      });

      expect(mockGenerateDownloadFile).toHaveBeenCalledWith({
        downloadId,
        workspaceId,
        downloadType,
      });

      expect(mockGeneratePresignedDownloadUrl).toHaveBeenCalledWith({
        downloadId,
        blobStorageKey: `downloads/${downloadType}/${downloadId}.csv`,
      });

      expect(mockUpdateDownloadStatus).toHaveBeenCalledWith({
        downloadId,
        status: "COMPLETE",
        blobStorageKey: `downloads/${downloadType}/${downloadId}.csv`,
        downloadUrl: "https://example.com/presigned-url",
      });
    });
  });

  test("should handle errors and mark download as failed", async () => {
    const downloadId = randomUUID();
    const workspaceId = randomUUID();
    const downloadType = "segments";

    mockGenerateDownloadFile.mockRejectedValue(new Error("File generation failed"));

    await worker.runUntil(async () => {
      const resultPromise = testEnv.client.workflow.execute(csvDownloadWorkflow, {
        taskQueue: "default",
        workflowId: `test-error-${downloadId}`,
        args: [
          {
            downloadId,
            workspaceId,
            downloadType,
          },
        ],
      });

      // Verify the workflow failed
      await expect(resultPromise).rejects.toThrow("File generation failed");

      // Verify error handling
      expect(mockUpdateDownloadStatus).toHaveBeenCalledWith({
        downloadId,
        status: "PROCESSING",
      });

      expect(mockUpdateDownloadStatus).toHaveBeenCalledWith({
        downloadId,
        status: "FAILED",
        error: "File generation failed",
      });

      // Should not call presigned URL generation on error
      expect(mockGeneratePresignedDownloadUrl).not.toHaveBeenCalled();
    });
  });

  test("should handle invalid download type", async () => {
    const downloadId = randomUUID();
    const workspaceId = randomUUID();
    const downloadType = "invalid-type";

    mockGenerateDownloadFile.mockRejectedValue(new Error("Unknown download type: invalid-type"));

    await worker.runUntil(async () => {
      const resultPromise = testEnv.client.workflow.execute(csvDownloadWorkflow, {
        taskQueue: "default",
        workflowId: `test-invalid-${downloadId}`,
        args: [
          {
            downloadId,
            workspaceId,
            downloadType,
          },
        ],
      });

      // Verify the workflow failed with appropriate error
      await expect(resultPromise).rejects.toThrow("Unknown download type: invalid-type");

      // Verify error was recorded
      expect(mockUpdateDownloadStatus).toHaveBeenCalledWith({
        downloadId,
        status: "FAILED",
        error: "Unknown download type: invalid-type",
      });
    });
  });
});