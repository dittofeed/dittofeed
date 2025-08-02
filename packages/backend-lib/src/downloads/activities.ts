import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { Readable } from "stream";

import { storage } from "../blobStorage";
import config from "../config";
import { db } from "../db";
import * as schema from "../db/schema";
import logger from "../logger";
import { generateEventsCsv } from "./generators/eventsCsv";
import { generateSegmentsCsv } from "./generators/segmentsCsv";
import { generateUsersCsv } from "./generators/usersCsv";

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

  logger().info("Starting download file generation", {
    downloadId,
    workspaceId,
    downloadType,
    blobStorageKey,
  });

  let csvStream: Readable;

  switch (downloadType) {
    case "segments":
      csvStream = await generateSegmentsCsv({ workspaceId });
      break;
    case "users":
      csvStream = await generateUsersCsv({ workspaceId });
      break;
    case "events":
      csvStream = await generateEventsCsv({ workspaceId });
      break;
    default:
      throw new Error(`Unknown download type: ${downloadType}`);
  }

  const s3Client = storage();
  const chunks: Uint8Array[] = [];

  csvStream.on("data", (chunk: Uint8Array) => {
    chunks.push(chunk);
  });

  await new Promise<void>((resolve, reject) => {
    csvStream.on("end", () => resolve());
    csvStream.on("error", (error) => reject(error));
  });

  const csvBuffer = Buffer.concat(chunks);

  const command = new PutObjectCommand({
    Bucket: config().blobStorageBucket,
    Key: blobStorageKey,
    Body: csvBuffer,
    ContentType: "text/csv",
  });

  await s3Client.send(command);

  logger().info("Download file generation completed", {
    downloadId,
    workspaceId,
    downloadType,
    blobStorageKey,
    fileSizeBytes: csvBuffer.length,
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
