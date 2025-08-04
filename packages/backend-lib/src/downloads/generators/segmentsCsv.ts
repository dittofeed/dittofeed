import { format } from "@fast-csv/format";
import { eq } from "drizzle-orm";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { Readable } from "stream";

import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  query as chQuery,
} from "../../clickhouse";
import { assignmentSequentialConsistency } from "../../config";
import { db } from "../../db";
import {
  segment as dbSegment,
  subscriptionGroup as dbSubscriptionGroup,
} from "../../db/schema";
import logger from "../../logger";
import { findAllUserPropertyAssignmentsForWorkspace } from "../../userProperties";

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

  // Start processing segment assignments in batches
  processSegmentAssignmentsBatch(workspaceId, csvStream, 0);

  return csvStream;
}

async function processSegmentAssignmentsBatch(
  workspaceId: string,
  csvStream: ReturnType<typeof format>,
  offset: number,
): Promise<void> {
  const identifiers = Object.values(CHANNEL_IDENTIFIERS);
  const batchSize = 10000;

  try {
    logger().info("Processing segment assignments batch", {
      workspaceId,
      offset,
      batchSize,
    });

    // Get segment assignments from ClickHouse with pagination
    const qb = new ClickHouseQueryBuilder();
    const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
    const offsetParam = qb.addQueryValue(offset, "UInt64");
    const limitParam = qb.addQueryValue(batchSize, "UInt64");

    const query = `
      SELECT
        computed_property_id,
        user_id,
        argMax(segment_value, assigned_at) as latest_segment_value
      FROM computed_property_assignments_v2
      WHERE
        workspace_id = ${workspaceIdParam}
        AND type = 'segment'
      GROUP BY computed_property_id, user_id
      ORDER BY computed_property_id, user_id
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const result = await chQuery({
      query,
      query_params: qb.getQueries(),
      clickhouse_settings: {
        select_sequential_consistency: assignmentSequentialConsistency(),
      },
    });

    const segmentAssignments = await result.json<{
      computed_property_id: string;
      latest_segment_value: boolean;
      user_id: string;
    }>();

    if (segmentAssignments.length === 0) {
      // No more data
      csvStream.end();
      return;
    }

    // Get segments metadata from Postgres
    const segments = await db()
      .select()
      .from(dbSegment)
      .where(eq(dbSegment.workspaceId, workspaceId))
      .leftJoin(
        dbSubscriptionGroup,
        eq(dbSegment.subscriptionGroupId, dbSubscriptionGroup.id),
      );

    const segmentMap = new Map<string, (typeof segments)[number]>();
    for (const segment of segments) {
      segmentMap.set(segment.Segment.id, segment);
    }

    // Get user identifiers for this batch
    const userIds = [...new Set(segmentAssignments.map((a) => a.user_id))];
    const userIdentifiers = await findAllUserPropertyAssignmentsForWorkspace({
      workspaceId,
    });

    // Process each assignment
    for (const assignment of segmentAssignments) {
      const segment = segmentMap.get(assignment.computed_property_id);
      if (!segment) {
        logger().error(
          {
            workspaceId,
            segmentId: assignment.computed_property_id,
          },
          "segment not found for segment assignment",
        );
        continue;
      }

      const csvRow: Record<string, string> = {
        segmentName: segment.Segment.name,
        subscriptionGroupName: segment.SubscriptionGroup?.name ?? "",
        segmentId: assignment.computed_property_id,
        userId: assignment.user_id,
        inSegment: assignment.latest_segment_value.toString(),
      };

      // Add user identifiers
      const ui = userIdentifiers[assignment.user_id];
      if (ui) {
        for (const key in ui) {
          const value = ui[key];
          if (typeof value === "string" && value.length > 0) {
            csvRow[key] = value;
          }
        }
      }

      // Convert to array format for fast-csv
      const row = [...downloadCsvHeaders, ...identifiers].map(
        (header) => csvRow[header] || "",
      );
      csvStream.write(row);
    }

    // Continue with next batch if we got a full batch
    if (segmentAssignments.length === batchSize) {
      await processSegmentAssignmentsBatch(
        workspaceId,
        csvStream,
        offset + batchSize,
      );
    } else {
      csvStream.end();
    }
  } catch (error) {
    logger().error("Error processing segment assignments batch", {
      workspaceId,
      offset,
      err: error,
    });
    csvStream.destroy(
      error instanceof Error ? error : new Error("Unknown error"),
    );
  }
}
