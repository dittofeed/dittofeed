import { format } from "@fast-csv/format";
import { Context } from "@temporalio/activity";
import { eq } from "drizzle-orm";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { Readable } from "stream";

import { db } from "../../db";
import {
  segment as dbSegment,
  subscriptionGroup as dbSubscriptionGroup,
} from "../../db/schema";
import logger from "../../logger";
import { getSegmentAssignmentsAndIdentifiers } from "../../segments";

export interface GenerateSegmentsCsvParams {
  workspaceId: string;
}

const downloadCsvHeaders = [
  "segmentName",
  "segmentId",
  "userId",
  "inSegment",
  "subscriptionGroupName",
];

export async function generateSegmentsCsv({
  workspaceId,
}: GenerateSegmentsCsvParams): Promise<Readable> {
  logger().info("Starting segments CSV generation", { workspaceId });

  const identifiers = Object.values(CHANNEL_IDENTIFIERS);
  const csvStream = format({
    headers: [...downloadCsvHeaders, ...identifiers],
  });

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
    segmentMap.set(segment.Segment.name, segment);
  });

  // Start processing segment assignments in batches with cursor-based pagination
  // Note: We start the async processing but return the stream immediately
  // The stream will be populated asynchronously
  processSegmentAssignmentsBatch(
    workspaceId,
    csvStream,
    undefined,
    segmentMap,
  ).catch((error) => {
    logger().error("Failed to process segment assignments", {
      workspaceId,
      error,
    });
    csvStream.destroy(
      error instanceof Error ? error : new Error("Unknown error"),
    );
  });

  return csvStream;
}

async function processSegmentAssignmentsBatch(
  workspaceId: string,
  csvStream: ReturnType<typeof format>,
  cursor: string | undefined,
  segmentMap: Map<string, any>,
): Promise<void> {
  const identifiers = Object.values(CHANNEL_IDENTIFIERS);
  const batchSize = 500; // Smaller batch size for better memory management

  try {
    logger().info("Processing segment assignments batch", {
      workspaceId,
      cursor,
      batchSize,
    });

    // Send heartbeat for Temporal activity
    Context.current()?.heartbeat({ workspaceId, cursor });

    // Get users with segment assignments and identifiers using the new efficient function
    const { users, cursor: nextCursor } =
      await getSegmentAssignmentsAndIdentifiers({
        workspaceId,
        cursor,
        limit: batchSize,
      });

    if (users.length === 0) {
      // No more data
      csvStream.end();
      return;
    }

    // Process each user and their segment assignments
    for (const user of users) {
      for (const [segmentName, inSegment] of Object.entries(user.segments)) {
        const segment = segmentMap.get(segmentName);

        const csvRow: Record<string, string> = {
          segmentName,
          subscriptionGroupName: segment?.SubscriptionGroup?.name ?? "",
          segmentId: segment?.Segment.id ?? "",
          userId: user.id,
          inSegment: inSegment.toString(),
        };

        // Add user identifiers
        if (user.email) {
          csvRow.email = user.email;
        }
        if (user.phone) {
          csvRow.phone = user.phone;
        }

        // Convert to array format for fast-csv
        const row = [...downloadCsvHeaders, ...identifiers].map(
          (header) => csvRow[header] || "",
        );
        csvStream.write(row);
      }
    }

    // Continue with next batch if there's a cursor
    if (nextCursor) {
      await processSegmentAssignmentsBatch(
        workspaceId,
        csvStream,
        nextCursor,
        segmentMap,
      );
    } else {
      csvStream.end();
    }
  } catch (error) {
    logger().error("Error processing segment assignments batch", {
      workspaceId,
      cursor,
      err: error,
    });
    csvStream.destroy(
      error instanceof Error ? error : new Error("Unknown error"),
    );
  }
}
