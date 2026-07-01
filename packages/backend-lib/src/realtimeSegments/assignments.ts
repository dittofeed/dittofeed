import { clickhouseClient } from "../clickhouse";
import config from "../config";
import {
  COMPUTED_PROPERTY_ASSIGNMENTS_CURRENT_TABLE,
  COMPUTED_PROPERTY_ASSIGNMENTS_TABLE,
} from "../userEvents/clickhouse";

export interface RealtimeSegmentAssignmentChange {
  workspaceId: string;
  userId: string;
  segmentId: string;
  inSegment: boolean;
  maxEventTime: Date;
  assignedAt: Date;
}

interface ClickHouseSegmentAssignment {
  workspace_id: string;
  type: "segment";
  computed_property_id: string;
  user_id: string;
  segment_value: boolean;
  user_property_value: "";
  max_event_time: string;
  assigned_at: string;
}

function toClickHouseAssignment(
  assignment: RealtimeSegmentAssignmentChange,
): ClickHouseSegmentAssignment {
  return {
    workspace_id: assignment.workspaceId,
    type: "segment",
    computed_property_id: assignment.segmentId,
    user_id: assignment.userId,
    segment_value: assignment.inSegment,
    user_property_value: "",
    max_event_time: assignment.maxEventTime.toISOString(),
    assigned_at: assignment.assignedAt.toISOString(),
  };
}

export async function writeRealtimeSegmentAssignments(
  assignments: RealtimeSegmentAssignmentChange[],
): Promise<void> {
  if (assignments.length === 0) {
    return;
  }

  const rows = assignments.map(toClickHouseAssignment);
  const tables = [COMPUTED_PROPERTY_ASSIGNMENTS_TABLE];
  if (config().writeComputedPropertyAssignmentsCurrent) {
    tables.push(COMPUTED_PROPERTY_ASSIGNMENTS_CURRENT_TABLE);
  }

  await Promise.all(
    tables.map((table) =>
      clickhouseClient().insert({
        table: `${table} (workspace_id, type, computed_property_id, user_id, segment_value, user_property_value, max_event_time, assigned_at)`,
        values: rows,
        format: "JSONEachRow",
        clickhouse_settings: { wait_end_of_query: 1 },
      }),
    ),
  );
}
