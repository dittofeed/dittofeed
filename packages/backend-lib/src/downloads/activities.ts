import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";

import { storage } from "../blobStorage";
import config from "../config";
import { db } from "../db";
import * as schema from "../db/schema";
import logger from "../logger";
import { generateSegmentsCsv } from "./generators/segmentsCsv";

export interface UpdateDownloadStatusParams {
  downloadId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETE" | "FAILED";
  blobStorageKey?: string;
  downloadUrl?: string;
  error?: string;
}

export async function updateDownloadStatus({
  downloadId,
  status,
  blobStorageKey,
  downloadUrl,
  error,
}: UpdateDownloadStatusParams): Promise<void> {
  await db()
    .update(schema.download)
    .set({
      status,
      blobStorageKey: blobStorageKey ?? undefined,
      downloadUrl: downloadUrl ?? undefined,
      error: error ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(schema.download.id, downloadId));

  logger().info("Updated download status", {
    downloadId,
    status,
    blobStorageKey,
    error,
  });
}

export interface GenerateDownloadFileParams {
  downloadId: string;
  workspaceId: string;
  downloadType: string;
}

export interface GenerateDownloadFileResult {
  blobStorageKey: string;
}

export async function generateDownloadFile({
  downloadId,
  workspaceId,
  downloadType,
}: GenerateDownloadFileParams): Promise<GenerateDownloadFileResult> {
  const blobStorageKey = `downloads/${downloadType}/${downloadId}.csv`;

  logger().info("Starting download file generation with S3 streaming", {
    downloadId,
    workspaceId,
    downloadType,
    blobStorageKey,
  });

  // Generate CSV and upload directly to S3 using streaming
  switch (downloadType) {
    case "segments":
      await generateSegmentsCsv({ workspaceId, blobStorageKey });
      break;
    case "users":
      // TODO: Update to use streaming approach
      throw new Error("Users CSV streaming not yet implemented");
    case "events":
      // TODO: Update to use streaming approach  
      throw new Error("Events CSV streaming not yet implemented");
    default:
      throw new Error(`Unknown download type: ${downloadType}`);
  }

  logger().info("Download file generation completed successfully", {
    downloadId,
    workspaceId,
    downloadType,
    blobStorageKey,
  });

  return { blobStorageKey };
}

export interface GeneratePresignedDownloadUrlParams {
  downloadId: string;
  blobStorageKey: string;
}

export interface GeneratePresignedDownloadUrlResult {
  downloadUrl: string;
}

export async function generatePresignedDownloadUrl({
  downloadId,
  blobStorageKey,
}: GeneratePresignedDownloadUrlParams): Promise<GeneratePresignedDownloadUrlResult> {
  const s3Client = storage();

  const command = new GetObjectCommand({
    Bucket: config().blobStorageBucket,
    Key: blobStorageKey,
  });

  const downloadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 24 * 60 * 60, // 24 hours
  });

  logger().info("Generated presigned download URL", {
    downloadId,
    blobStorageKey,
    expiresIn: "24 hours",
  });

  return { downloadUrl };
}
