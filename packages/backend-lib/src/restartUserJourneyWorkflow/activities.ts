/* eslint-disable no-await-in-loop */
import { ClickHouseQueryBuilder, query as chQuery } from "../clickhouse";

interface SegmentAssignment {
  user_id: string;
}

export async function restartUserJourneysActivity({
  workspaceId,
  journeyId,
  segmentId,
  pageSize = 100,
}: {
  workspaceId: string;
  journeyId: string;
  segmentId: string;
  pageSize?: number;
}) {
  let page: SegmentAssignment[] = [];
  let cursor: string | null = null;
  while (page.length >= pageSize || cursor === null) {
    const qb = new ClickHouseQueryBuilder();
    const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
    const segmentIdParam = qb.addQueryValue(segmentId, "String");
    const paginationClause =
      cursor === null
        ? ""
        : `AND user_id > ${qb.addQueryValue(cursor, "String")}`;

    const query = `
      SELECT user_id FROM computed_property_state_v2 
      WHERE 
        workspace_id = ${workspaceIdParam}
        AND type = 'segment'
        AND computed_property_id = ${segmentIdParam}
        ${paginationClause}
      LIMIT ${pageSize}
    `;
    const result = await chQuery({
      query,
    });
    page = await result.json<SegmentAssignment>();
    const newCursor = page[page.length - 1]?.user_id;
    if (!newCursor) {
      break;
    }
    cursor = newCursor;
  }
}
