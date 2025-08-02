import { eq } from "drizzle-orm";
import { Readable } from "stream";
import { format } from "@fast-csv/format";

import { db } from "../../db";
import * as schema from "../../db/schema";
import logger from "../../logger";

export interface GenerateUsersCsvParams {
  workspaceId: string;
}

interface UserCsvRow {
  userId: string;
  propertyName: string;
  propertyValue: string;
}

export async function generateUsersCsv({
  workspaceId,
}: GenerateUsersCsvParams): Promise<Readable> {
  logger().info("Starting users CSV generation", { workspaceId });

  const csvStream = format({
    headers: [
      "User ID",
      "Property Name",
      "Property Value",
    ],
  });

  // Start processing user property assignments in batches
  processUsersBatch(workspaceId, csvStream, null);

  return csvStream;
}

async function processUsersBatch(
  workspaceId: string,
  csvStream: ReturnType<typeof format>,
  cursor: string | null,
): Promise<void> {
  const batchSize = 1000;
  
  try {
    const userPropertyAssignments = await db().query.userPropertyAssignment.findMany({
      where: eq(schema.userPropertyAssignment.workspaceId, workspaceId),
      limit: batchSize,
      offset: cursor ? parseInt(cursor) : 0,
      with: {
        userProperty: true,
      },
    });

    logger().info("Processing users batch", {
      workspaceId,
      batchSize: userPropertyAssignments.length,
      cursor,
    });

    for (const assignment of userPropertyAssignments) {
      const row = [
        assignment.userId,
        assignment.userProperty.name,
        assignment.value,
      ];

      csvStream.write(row);
    }

    if (userPropertyAssignments.length === batchSize) {
      // More data to process
      const nextCursor = cursor ? (parseInt(cursor) + batchSize).toString() : batchSize.toString();
      await processUsersBatch(workspaceId, csvStream, nextCursor);
    } else {
      // No more data, end the stream
      csvStream.end();
    }
  } catch (error) {
    logger().error("Error processing users batch", {
      workspaceId,
      cursor,
      err: error,
    });
    csvStream.destroy(error instanceof Error ? error : new Error("Unknown error"));
  }
}