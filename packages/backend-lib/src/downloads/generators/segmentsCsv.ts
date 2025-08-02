import { format } from "@fast-csv/format";
import { eq } from "drizzle-orm";
import { Readable } from "stream";

import { db } from "../../db";
import * as schema from "../../db/schema";
import logger from "../../logger";

export interface GenerateSegmentsCsvParams {
  workspaceId: string;
}

interface SegmentCsvRow {
  id: string;
  name: string;
  status: string;
  resourceType: string;
  createdAt: string;
  updatedAt: string;
  definitionUpdatedAt: string;
}

async function processSegmentsBatch(
  workspaceId: string,
  csvStream: ReturnType<typeof format>,
  cursor: string | null,
): Promise<void> {
  const batchSize = 1000;

  try {
    const segments = await db().query.segment.findMany({
      where: eq(schema.segment.workspaceId, workspaceId),
      limit: batchSize,
      offset: cursor ? parseInt(cursor) : 0,
      orderBy: [schema.segment.createdAt],
    });

    logger().info("Processing segments batch", {
      workspaceId,
      batchSize: segments.length,
      cursor,
    });

    for (const segment of segments) {
      const row = [
        segment.id,
        segment.name,
        segment.status,
        segment.resourceType,
        segment.createdAt.toISOString(),
        segment.updatedAt.toISOString(),
        segment.definitionUpdatedAt.toISOString(),
      ];

      csvStream.write(row);
    }

    if (segments.length === batchSize) {
      // More data to process
      const nextCursor = cursor
        ? (parseInt(cursor) + batchSize).toString()
        : batchSize.toString();
      await processSegmentsBatch(workspaceId, csvStream, nextCursor);
    } else {
      // No more data, end the stream
      csvStream.end();
    }
  } catch (error) {
    logger().error("Error processing segments batch", {
      workspaceId,
      cursor,
      err: error,
    });
    csvStream.destroy(
      error instanceof Error ? error : new Error("Unknown error"),
    );
  }
}

export async function generateSegmentsCsv({
  workspaceId,
}: GenerateSegmentsCsvParams): Promise<Readable> {
  logger().info("Starting segments CSV generation", { workspaceId });

  const csvStream = format({
    headers: [
      "ID",
      "Name",
      "Status",
      "Resource Type",
      "Created At",
      "Updated At",
      "Definition Updated At",
    ],
  });

  // Start processing segments in batches
  processSegmentsBatch(workspaceId, csvStream, null);

  return csvStream;
}
