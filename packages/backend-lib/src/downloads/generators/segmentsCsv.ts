/* eslint-disable no-await-in-loop */
import { Upload } from "@aws-sdk/lib-storage";
import { format } from "@fast-csv/format";
import { Context } from "@temporalio/activity";
import { eq } from "drizzle-orm";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { PassThrough } from "stream";
import { pipeline } from "stream/promises";

import { storage } from "../../blobStorage";
import config from "../../config";
import { db } from "../../db";
import {
  segment as dbSegment,
  subscriptionGroup as dbSubscriptionGroup,
} from "../../db/schema";
import logger from "../../logger";
import { getSegmentAssignmentsAndIdentifiers } from "../../segments";

async function paginateAndWriteData(
  workspaceId: string,
  sourceStream: PassThrough,
  segmentMap: Map<
    string,
    {
      Segment: {
        id: string;
        name: string;
        workspaceId: string;
      };
      SubscriptionGroup: {
        id: string;
        name: string;
      } | null;
    }
  >,
): Promise<void> {
  const batchSize = 300; // Reasonable batch size for memory management
  let cursor: string | undefined;
  let hasMore = true;

  try {
    while (hasMore) {
      logger().info("Fetching segment assignments page", {
        workspaceId,
        cursor,
        batchSize,
      });

      // Send heartbeat for Temporal activity
      Context.current()?.heartbeat({ workspaceId, cursor });

      // Get users with segment assignments and identifiers using cursor-based pagination
      const { users, cursor: nextCursor } =
        await getSegmentAssignmentsAndIdentifiers({
          workspaceId,
          cursor,
          limit: batchSize,
        });

      if (users.length === 0) {
        hasMore = false;
        break;
      }

      // Process each user and their segment assignments
      for (const user of users) {
        for (const [segmentId, inSegment] of Object.entries(user.segments)) {
          const segment = segmentMap.get(segmentId);

          const rowData: SegmentRowData = {
            segmentName: segment?.Segment.name ?? "",
            segmentId,
            userId: user.id,
            inSegment: inSegment.toString(),
            subscriptionGroupName: segment?.SubscriptionGroup?.name ?? "",
            email: user.email,
            phone: user.phone,
          };

          // Write row to the source stream with backpressure handling
          if (!sourceStream.write(rowData)) {
            // If the stream's buffer is full, wait for it to drain
            await new Promise((resolve) => sourceStream.once("drain", resolve));
          }
        }
      }

      // Update heartbeat after processing this batch (data has been written to stream and uploaded)
      Context.current()?.heartbeat({
        workspaceId,
        cursor: nextCursor,
        processedUsers: users.length,
        batchComplete: true,
      });

      // Check if we have more data to fetch
      if (users.length < batchSize || !nextCursor) {
        hasMore = false;
      } else {
        cursor = nextCursor;
      }
    }

    logger().info("All segment assignment pages processed", { workspaceId });

    // Signal that we're done writing data
    sourceStream.end();
  } catch (error) {
    logger().error("Error during pagination", {
      workspaceId,
      cursor,
      error,
    });
    sourceStream.destroy(
      error instanceof Error ? error : new Error("Unknown error"),
    );
    throw error;
  }
}

export interface GenerateSegmentsCsvParams {
  workspaceId: string;
  blobStorageKey: string;
}

const downloadCsvHeaders = [
  "segmentName",
  "segmentId",
  "userId",
  "inSegment",
  "subscriptionGroupName",
];

interface SegmentRowData {
  segmentName: string;
  segmentId: string;
  userId: string;
  inSegment: string;
  subscriptionGroupName: string;
  email?: string;
  phone?: string;
}

export async function generateSegmentsCsv({
  workspaceId,
  blobStorageKey,
}: GenerateSegmentsCsvParams): Promise<void> {
  logger().info("Starting segments CSV generation with S3 streaming", {
    workspaceId,
    blobStorageKey,
  });

  const identifiers = Object.values(CHANNEL_IDENTIFIERS);

  // PassThrough stream acts as a bridge between manual writes and the pipeline
  const sourceStream = new PassThrough({ objectMode: true });

  // Get segment metadata once at the beginning
  const segments = await db()
    .select()
    .from(dbSegment)
    .where(eq(dbSegment.workspaceId, workspaceId))
    .leftJoin(
      dbSubscriptionGroup,
      eq(dbSegment.subscriptionGroupId, dbSubscriptionGroup.id),
    );

  const segmentMap = new Map<string, (typeof segments)[number]>();
  segments.forEach((segment) => {
    segmentMap.set(segment.Segment.id, segment);
  });

  // Create CSV formatter with explicit headers and transformation
  const csvFormatter = format({
    headers: [...downloadCsvHeaders, ...identifiers],
    transform: (row: SegmentRowData) => {
      const csvRow: Record<string, string> = {
        segmentName: row.segmentName,
        segmentId: row.segmentId,
        userId: row.userId,
        inSegment: row.inSegment,
        subscriptionGroupName: row.subscriptionGroupName,
      };

      // Add user identifiers
      if (row.email) csvRow.email = row.email;
      if (row.phone) csvRow.phone = row.phone;

      return csvRow;
    },
  });

  // Set up S3 upload with multipart support
  const s3Client = storage();
  const s3Upload = new Upload({
    client: s3Client,
    params: {
      Bucket: config().blobStorageBucket,
      Key: blobStorageKey,
      Body: csvFormatter, // Stream directly from CSV formatter to S3
      ContentType: "text/csv",
    },
    partSize: 5 * 1024 * 1024, // 5MB parts for multipart upload
    queueSize: 4, // Allow 4 concurrent part uploads
  });

  // Add progress logging
  s3Upload.on("httpUploadProgress", (progress) => {
    const percent =
      progress.loaded && progress.total
        ? Math.round((progress.loaded / progress.total) * 100)
        : "unknown";
    logger().info("S3 Upload Progress", {
      workspaceId,
      loaded: progress.loaded,
      total: progress.total,
      percent: `${percent}%`,
    });
  });

  try {
    // Start both the S3 upload and the data processing pipeline concurrently
    // 1. S3 upload promise - reads from csvFormatter stream
    const s3UploadPromise = s3Upload.done();

    // 2. Data processing pipeline - connects sourceStream to csvFormatter
    const dataProcessingPipeline = pipeline(sourceStream, csvFormatter);

    // 3. Manual pagination loop - writes data to sourceStream
    const paginationPromise = paginateAndWriteData(
      workspaceId,
      sourceStream,
      segmentMap,
    );

    // Wait for all three operations to complete
    await Promise.all([
      s3UploadPromise,
      dataProcessingPipeline,
      paginationPromise,
    ]);

    logger().info("Segments CSV generation completed successfully", {
      workspaceId,
      blobStorageKey,
    });
  } catch (error) {
    logger().error("Segments CSV generation failed", {
      workspaceId,
      blobStorageKey,
      error,
    });

    // Abort the S3 upload to clean up any partial multipart upload
    await s3Upload.abort();
    throw error;
  }
}
