import {
  ChartDataPoint,
  GetChartDataRequest,
  GetChartDataResponse,
  GetSummarizedDataRequest,
  GetSummarizedDataResponse,
  ResolvedChartGranularity,
} from "isomorphic-lib/src/types";

import { ClickHouseQueryBuilder, query as chQuery } from "./clickhouse";
import logger from "./logger";
import { InternalEventType } from "./types";

/**
 * Auto-select granularity based on time range width
 */
function selectAutoGranularity({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  // Select granularity to aim for roughly 50-200 data points
  if (diffHours <= 2) {
    return "1minute";
  }
  if (diffHours <= 8) {
    return "5minutes";
  }
  if (diffHours <= 24) {
    return "30minutes";
  }
  if (diffDays <= 7) {
    return "1hour";
  }
  if (diffDays <= 30) {
    return "6hours";
  }
  if (diffDays <= 90) {
    return "1day";
  }
  if (diffDays <= 365) {
    return "7days";
  }
  return "30days";
}

/**
 * Convert granularity to ClickHouse time function
 */
function getClickHouseTimeFunction({
  granularity,
  startDate,
  endDate,
}: {
  granularity: string;
  startDate?: string;
  endDate?: string;
}): string {
  let actualGranularity = granularity;

  if (granularity === "auto" && startDate && endDate) {
    actualGranularity = selectAutoGranularity({ startDate, endDate });
  }

  switch (actualGranularity) {
    case "30second":
      return "toStartOfInterval(processing_time, INTERVAL 30 SECOND)";
    case "1minute":
      return "toStartOfMinute(processing_time)";
    case "5minutes":
      return "toStartOfInterval(processing_time, INTERVAL 5 MINUTE)";
    case "10minutes":
      return "toStartOfInterval(processing_time, INTERVAL 10 MINUTE)";
    case "30minutes":
      return "toStartOfInterval(processing_time, INTERVAL 30 MINUTE)";
    case "1hour":
      return "toStartOfHour(processing_time)";
    case "6hours":
      return "toStartOfInterval(processing_time, INTERVAL 6 HOUR)";
    case "12hours":
      return "toStartOfInterval(processing_time, INTERVAL 12 HOUR)";
    case "1day":
      return "toStartOfDay(processing_time)";
    case "7days":
      return "toStartOfInterval(processing_time, INTERVAL 7 DAY)";
    case "30days":
      return "toStartOfInterval(processing_time, INTERVAL 30 DAY)";
    case "auto":
    default:
      // Fallback to hourly
      return "toStartOfHour(processing_time)";
  }
}

/**
 * Get chart data for the analysis dashboard
 */
export async function getChartData({
  workspaceId,
  startDate,
  endDate,
  granularity = "auto",
  displayMode,
  groupBy,
  filters,
}: GetChartDataRequest): Promise<GetChartDataResponse> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");

  // Build filter clauses
  let filterClauses = "";
  if (filters) {
    const conditions: string[] = [];

    if (filters.journeyIds && filters.journeyIds.length > 0) {
      conditions.push(
        `JSONExtractString(properties, 'journeyId') IN ${qb.addQueryValue(filters.journeyIds, "Array(String)")}`,
      );
    }

    if (filters.broadcastIds && filters.broadcastIds.length > 0) {
      conditions.push(
        `JSONExtractString(properties, 'broadcastId') IN ${qb.addQueryValue(filters.broadcastIds, "Array(String)")}`,
      );
    }

    if (filters.channels && filters.channels.length > 0) {
      conditions.push(
        `JSONExtractString(properties, 'variant.type') IN ${qb.addQueryValue(filters.channels, "Array(String)")}`,
      );
    }

    if (filters.providers && filters.providers.length > 0) {
      conditions.push(
        `JSONExtractString(properties, 'provider') IN ${qb.addQueryValue(filters.providers, "Array(String)")}`,
      );
    }

    if (filters.messageStates && filters.messageStates.length > 0) {
      conditions.push(
        `event IN ${qb.addQueryValue(filters.messageStates, "Array(String)")}`,
      );
    }

    if (filters.templateIds && filters.templateIds.length > 0) {
      conditions.push(
        `JSONExtractString(properties, 'templateId') IN ${qb.addQueryValue(filters.templateIds, "Array(String)")}`,
      );
    }

    if (conditions.length > 0) {
      filterClauses = `AND ${conditions.join(" AND ")}`;
    }
  }

  // Build group by clause
  let groupByClause = "GROUP BY timestamp";
  let selectClause = "'' as groupKey, '' as groupLabel";

  if (groupBy) {
    switch (groupBy) {
      case "journey":
        selectClause =
          "JSONExtractString(properties, 'journeyId') as groupKey, JSONExtractString(properties, 'journeyName') as groupLabel";
        groupByClause = "GROUP BY timestamp, groupKey, groupLabel";
        break;
      case "broadcast":
        selectClause =
          "JSONExtractString(properties, 'broadcastId') as groupKey, JSONExtractString(properties, 'broadcastName') as groupLabel";
        groupByClause = "GROUP BY timestamp, groupKey, groupLabel";
        break;
      case "channel":
        selectClause =
          "JSONExtractString(properties, 'variant.type') as groupKey, JSONExtractString(properties, 'variant.type') as groupLabel";
        groupByClause = "GROUP BY timestamp, groupKey, groupLabel";
        break;
      case "provider":
        selectClause =
          "JSONExtractString(properties, 'provider') as groupKey, JSONExtractString(properties, 'provider') as groupLabel";
        groupByClause = "GROUP BY timestamp, groupKey, groupLabel";
        break;
      case "messageState":
        selectClause = "event as groupKey, event as groupLabel";
        groupByClause = "GROUP BY timestamp, groupKey, groupLabel";
        break;
    }
  }

  // Resolve the actual granularity used
  let resolvedGranularity: ResolvedChartGranularity = granularity === "auto" 
    ? selectAutoGranularity({ startDate, endDate }) as ResolvedChartGranularity
    : granularity as ResolvedChartGranularity;

  const timeFunction = getClickHouseTimeFunction({
    granularity,
    startDate,
    endDate,
  });

  const query = `
    SELECT
      ${timeFunction} as timestamp,
      uniqExact(origin_message_id) as value,
      ${selectClause}
    FROM (
      SELECT
        processing_time,
        event,
        properties,
        if(event = '${InternalEventType.MessageSent}', message_id, JSON_VALUE(properties, '$.messageId')) as origin_message_id,
        ${selectClause.replace(/properties/g, 'uev.properties')}
      FROM user_events_v2 AS uev
      WHERE
        workspace_id = ${workspaceIdParam}
        AND processing_time >= parseDateTimeBestEffort(${qb.addQueryValue(startDate, "String")}, 'UTC')
        AND processing_time <= parseDateTimeBestEffort(${qb.addQueryValue(endDate, "String")}, 'UTC')
        AND event_type = 'track'
        AND event IN ('${InternalEventType.MessageSent}', '${InternalEventType.EmailDelivered}', '${InternalEventType.EmailOpened}', '${InternalEventType.EmailClicked}', '${InternalEventType.EmailBounced}')
        ${filterClauses.replace(/properties/g, 'uev.properties')}
    ) AS processed_events
    WHERE origin_message_id != ''
    ${groupByClause}
    ORDER BY timestamp ASC
  `;

  logger().debug(
    {
      query,
      workspaceId,
      startDate,
      endDate,
      granularity,
      displayMode,
      groupBy,
      filters,
    },
    "Executing chart data query",
  );

  const result = await chQuery({
    query,
    query_params: qb.getQueries(),
    format: "JSONEachRow",
    clickhouse_settings: {
      date_time_output_format: "iso",
      function_json_value_return_type_allow_complex: 1,
    },
  });

  const rows = await result.json<{
    timestamp: string;
    value: string | number;
    groupKey?: string;
    groupLabel?: string;
  }>();

  const data: ChartDataPoint[] = rows.map((row) => ({
    timestamp: row.timestamp,
    value: typeof row.value === "string" ? parseInt(row.value, 10) : row.value,
    groupKey: row.groupKey || undefined,
    groupLabel: row.groupLabel || undefined,
  }));

  return { data, granularity: resolvedGranularity };
}

/**
 * Get summarized metrics for the analysis dashboard
 */
export async function getSummarizedData({
  workspaceId,
  startDate,
  endDate,
  displayMode,
  filters,
}: GetSummarizedDataRequest): Promise<GetSummarizedDataResponse> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");

  // Build filter clauses
  let filterClauses = "";
  if (filters) {
    const conditions: string[] = [];

    if (filters.journeyIds && filters.journeyIds.length > 0) {
      conditions.push(
        `JSONExtractString(properties, 'journeyId') IN ${qb.addQueryValue(filters.journeyIds, "Array(String)")}`,
      );
    }

    if (filters.broadcastIds && filters.broadcastIds.length > 0) {
      conditions.push(
        `JSONExtractString(properties, 'broadcastId') IN ${qb.addQueryValue(filters.broadcastIds, "Array(String)")}`,
      );
    }

    if (filters.channels && filters.channels.length > 0) {
      conditions.push(
        `JSONExtractString(properties, 'variant.type') IN ${qb.addQueryValue(filters.channels, "Array(String)")}`,
      );
    }

    if (filters.providers && filters.providers.length > 0) {
      conditions.push(
        `JSONExtractString(properties, 'provider') IN ${qb.addQueryValue(filters.providers, "Array(String)")}`,
      );
    }

    if (filters.messageStates && filters.messageStates.length > 0) {
      conditions.push(
        `event IN ${qb.addQueryValue(filters.messageStates, "Array(String)")}`,
      );
    }

    if (filters.templateIds && filters.templateIds.length > 0) {
      conditions.push(
        `JSONExtractString(properties, 'templateId') IN ${qb.addQueryValue(filters.templateIds, "Array(String)")}`,
      );
    }

    if (conditions.length > 0) {
      filterClauses = `AND ${conditions.join(" AND ")}`;
    }
  }

  const query = `
    WITH summary_data AS (
      SELECT
        event,
        uniqExact(origin_message_id) as event_count
      FROM (
        SELECT
          event,
          if(event = '${InternalEventType.MessageSent}', message_id, JSON_VALUE(properties, '$.messageId')) as origin_message_id
        FROM user_events_v2
        WHERE
          workspace_id = ${workspaceIdParam}
          AND event_time >= parseDateTimeBestEffort(${qb.addQueryValue(startDate, "String")}, 'UTC')
          AND event_time <= parseDateTimeBestEffort(${qb.addQueryValue(endDate, "String")}, 'UTC')
          AND event_type = 'track'
          AND event IN ('${InternalEventType.MessageSent}', '${InternalEventType.EmailDelivered}', '${InternalEventType.EmailOpened}', '${InternalEventType.EmailClicked}', '${InternalEventType.EmailBounced}')
          ${filterClauses}
      ) AS processed_events
      WHERE origin_message_id != ''
      GROUP BY event
    )
    SELECT
      sumIf(event_count, event = '${InternalEventType.MessageSent}') as deliveries,
      sumIf(event_count, event = '${InternalEventType.EmailOpened}') as opens,
      sumIf(event_count, event = '${InternalEventType.EmailClicked}') as clicks,
      sumIf(event_count, event = '${InternalEventType.EmailBounced}') as bounces
    FROM summary_data
  `;

  logger().debug(
    { query, workspaceId, startDate, endDate, displayMode, filters },
    "Executing summarized data query",
  );

  const result = await chQuery({
    query,
    query_params: qb.getQueries(),
    format: "JSONEachRow",
    clickhouse_settings: {
      date_time_output_format: "iso",
      function_json_value_return_type_allow_complex: 1,
    },
  });

  const rows = await result.json<{
    deliveries: string | number;
    opens: string | number;
    clicks: string | number;
    bounces: string | number;
  }>();

  const rawSummary = rows[0] || {
    deliveries: "0",
    opens: "0",
    clicks: "0",
    bounces: "0",
  };

  const summary = {
    deliveries:
      typeof rawSummary.deliveries === "string"
        ? parseInt(rawSummary.deliveries, 10)
        : rawSummary.deliveries,
    opens:
      typeof rawSummary.opens === "string"
        ? parseInt(rawSummary.opens, 10)
        : rawSummary.opens,
    clicks:
      typeof rawSummary.clicks === "string"
        ? parseInt(rawSummary.clicks, 10)
        : rawSummary.clicks,
    bounces:
      typeof rawSummary.bounces === "string"
        ? parseInt(rawSummary.bounces, 10)
        : rawSummary.bounces,
  };

  return { summary };
}
