import {
  ChannelType,
  ChartDataPoint,
  GetChartDataRequest,
  GetChartDataResponse,
  GetJourneyEditorStatsRequest,
  GetJourneyEditorStatsResponse,
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
 * Get chart data for the analysis dashboard.
 *
 * This method aggregates message events into time-bucketed counts, with support for:
 * - Cascading event logic: clicks count as opens+deliveries, opens count as deliveries
 * - Deduplication: each message can only contribute once to each state type
 * - Flexible grouping: by journey, broadcast, template, channel, provider, or message state
 * - When grouping by state, counts are disaggregated by event type
 * - When not grouping by state, all events aggregate into a single count
 *
 * Event hierarchy (higher events include lower events):
 * - Click events count as: click + open + delivery
 * - Open events count as: open + delivery
 * - Delivery events count as: delivery
 * - But each message can only be counted once per state type
 */
export async function getChartData({
  workspaceId,
  startDate,
  endDate,
  granularity = "auto",
  groupBy,
  filters,
}: GetChartDataRequest): Promise<GetChartDataResponse> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");

  // Build filter clauses (applied to SENT events only)
  let sentFilterClauses = "";
  if (filters) {
    const sentConditions: string[] = [];

    if (filters.journeyIds && filters.journeyIds.length > 0) {
      sentConditions.push(
        `journey_id IN ${qb.addQueryValue(filters.journeyIds, "Array(String)")}`,
      );
    }

    if (filters.broadcastIds && filters.broadcastIds.length > 0) {
      sentConditions.push(
        `broadcast_id IN ${qb.addQueryValue(filters.broadcastIds, "Array(String)")}`,
      );
    }

    if (filters.channels && filters.channels.length > 0) {
      sentConditions.push(
        `channel_type IN ${qb.addQueryValue(filters.channels, "Array(String)")}`,
      );
    }

    if (filters.providers && filters.providers.length > 0) {
      sentConditions.push(
        `JSON_VALUE(properties, '$.variant.provider.type') IN ${qb.addQueryValue(filters.providers, "Array(String)")}`,
      );
    }

    if (filters.templateIds && filters.templateIds.length > 0) {
      sentConditions.push(
        `template_id IN ${qb.addQueryValue(filters.templateIds, "Array(String)")}`,
      );
    }

    if (filters.userIds && filters.userIds.length > 0) {
      sentConditions.push(
        `user_or_anonymous_id IN ${qb.addQueryValue(filters.userIds, "Array(String)")}`,
      );
    }

    if (sentConditions.length > 0) {
      sentFilterClauses = `AND ${sentConditions.join(" AND ")}`;
    }
  }

  // Build select clause for grouping
  let selectClause = "'' as groupKey";

  if (groupBy) {
    switch (groupBy) {
      case "journey":
        selectClause = "journey_id as groupKey";
        break;
      case "broadcast":
        selectClause = "broadcast_id as groupKey";
        break;
      case "messageTemplate":
        selectClause = "template_id as groupKey";
        break;
      case "channel":
        selectClause = "channel_type as groupKey";
        break;
      case "provider":
        selectClause =
          "JSON_VALUE(properties, '$.variant.provider.type') as groupKey";
        break;
      case "messageState":
        selectClause = "event as groupKey";
        break;
    }
  }

  // Resolve the actual granularity used
  const resolvedGranularity: ResolvedChartGranularity =
    granularity === "auto"
      ? (selectAutoGranularity({
          startDate,
          endDate,
        }) as ResolvedChartGranularity)
      : granularity;

  const timeFunction = getClickHouseTimeFunction({
    granularity,
    startDate,
    endDate,
  });

  // We will always cohort by SENT events, and derive status flags by joining all status events for that cohort

  // Simplify query structure based on whether we're grouping by message state or not
  let groupSelectClause = selectClause;
  let groupBySQL = "";

  if (groupBy) {
    if (groupBy === "messageState") {
      groupSelectClause = "'' as groupKey";
      groupBySQL = "GROUP BY timestamp, groupKey";
    } else {
      groupBySQL = "GROUP BY timestamp, groupKey";
    }
  } else {
    groupSelectClause = "'' as groupKey";
    groupBySQL = "GROUP BY timestamp";
  }

  // Build query with SENT cohort bucketing and status join; timestamps come from SENT bucket
  const query = `
    WITH sent_messages AS (
      SELECT
        ie.message_id AS origin_message_id,
        ${timeFunction.replace(/processing_time/g, "ie.processing_time")} AS timestamp,
        ${groupSelectClause.replace(/properties/g, "ie.properties")}
      FROM internal_events AS ie
      WHERE
        ie.workspace_id = ${workspaceIdParam}
        AND ie.processing_time >= parseDateTimeBestEffort(${qb.addQueryValue(startDate, "String")}, 'UTC')
        AND ie.processing_time <= parseDateTimeBestEffort(${qb.addQueryValue(endDate, "String")}, 'UTC')
        AND ie.event = '${InternalEventType.MessageSent}'
        AND ie.hidden = false
        ${sentFilterClauses}
    ),
    status_events AS (
      SELECT
        ie.origin_message_id,
        ie.event
      FROM internal_events AS ie
      WHERE
        ie.workspace_id = ${workspaceIdParam}
        AND ie.event IN (
          '${InternalEventType.EmailDelivered}',
          '${InternalEventType.SmsDelivered}',
          '${InternalEventType.EmailOpened}',
          '${InternalEventType.EmailClicked}',
          '${InternalEventType.EmailBounced}',
          '${InternalEventType.SmsFailed}'
        )
        AND ie.origin_message_id IN (SELECT origin_message_id FROM sent_messages)
    ),
    message_flags AS (
      SELECT
        origin_message_id,
        max(event IN ('${InternalEventType.EmailDelivered}', '${InternalEventType.SmsDelivered}')) AS has_delivered,
        max(event = '${InternalEventType.EmailOpened}') AS has_opened,
        max(event = '${InternalEventType.EmailClicked}') AS has_clicked,
        max(event IN ('${InternalEventType.EmailBounced}', '${InternalEventType.SmsFailed}')) AS has_bounced
      FROM status_events
      WHERE origin_message_id != ''
      GROUP BY origin_message_id
    ),
    message_states_per_message AS (
      SELECT
        sm.origin_message_id,
        sm.groupKey,
        sm.timestamp,
        1 AS has_sent,
        toUInt8(coalesce(mf.has_delivered, 0)) AS has_delivered,
        toUInt8(coalesce(mf.has_opened, 0)) AS has_opened,
        toUInt8(coalesce(mf.has_clicked, 0)) AS has_clicked,
        toUInt8(coalesce(mf.has_bounced, 0)) AS has_bounced
      FROM sent_messages sm
      LEFT JOIN message_flags mf USING (origin_message_id)
    )
    ${
      groupBy === "messageState"
        ? `
    SELECT
      timestamp,
      event_type as groupKey,
      sum(count) as count
    FROM (
      SELECT timestamp, 'sent' as event_type, sum(toUInt64(has_sent)) as count
      FROM message_states_per_message
      WHERE has_sent = 1
      GROUP BY timestamp

      UNION ALL

      SELECT timestamp, 'delivered' as event_type, sum(toUInt64(has_delivered)) as count
      FROM message_states_per_message
      WHERE has_delivered = 1
      GROUP BY timestamp

      UNION ALL

      SELECT timestamp, 'opened' as event_type, sum(toUInt64(has_opened)) as count
      FROM message_states_per_message
      WHERE has_opened = 1
      GROUP BY timestamp

      UNION ALL

      SELECT timestamp, 'clicked' as event_type, sum(toUInt64(has_clicked)) as count
      FROM message_states_per_message
      WHERE has_clicked = 1
      GROUP BY timestamp

      UNION ALL

      SELECT timestamp, 'bounced' as event_type, sum(toUInt64(has_bounced)) as count
      FROM message_states_per_message
      WHERE has_bounced = 1
      GROUP BY timestamp
    ) all_states
    GROUP BY timestamp, event_type
    `
        : `
    SELECT
      timestamp,
      ${groupBy ? "groupKey" : "'' as groupKey"},
      count(*) as count
    FROM message_states_per_message
    ${groupBySQL}
    `
    }
    ORDER BY timestamp ASC
  `;

  logger().debug(
    {
      query,
      workspaceId,
      startDate,
      endDate,
      granularity,
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
    count: string | number;
    groupKey?: string;
  }>();

  // For this stage, we return IDs only without resolving names
  // This removes the resource name lookup logic as specified in Stage 4

  const data: ChartDataPoint[] = rows.map((row) => {
    return {
      timestamp: row.timestamp,
      count:
        typeof row.count === "string" ? parseInt(row.count, 10) : row.count,
      groupKey: row.groupKey || undefined,
      groupLabel: row.groupKey || undefined, // Use ID as label since we're not resolving names
    };
  });

  return { data, granularity: resolvedGranularity };
}

/**
 * Get summarized metrics for the analysis dashboard
 */
export async function getSummarizedData({
  workspaceId,
  startDate,
  endDate,
  filters,
}: GetSummarizedDataRequest): Promise<GetSummarizedDataResponse> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");

  // Build filter clauses for SENT events only
  let sentSummaryFilterClauses = "";
  if (filters) {
    const conditions: string[] = [];

    if (filters.journeyIds && filters.journeyIds.length > 0) {
      conditions.push(
        `journey_id IN ${qb.addQueryValue(filters.journeyIds, "Array(String)")}`,
      );
    }

    if (filters.broadcastIds && filters.broadcastIds.length > 0) {
      conditions.push(
        `broadcast_id IN ${qb.addQueryValue(filters.broadcastIds, "Array(String)")}`,
      );
    }

    if (filters.channel) {
      conditions.push(
        `channel_type = ${qb.addQueryValue(filters.channel, "String")}`,
      );
    }

    if (filters.providers && filters.providers.length > 0) {
      conditions.push(
        `JSON_VALUE(properties, '$.variant.provider.type') IN ${qb.addQueryValue(filters.providers, "Array(String)")}`,
      );
    }

    if (filters.templateIds && filters.templateIds.length > 0) {
      conditions.push(
        `template_id IN ${qb.addQueryValue(filters.templateIds, "Array(String)")}`,
      );
    }

    if (filters.userIds && filters.userIds.length > 0) {
      conditions.push(
        `user_or_anonymous_id IN ${qb.addQueryValue(filters.userIds, "Array(String)")}`,
      );
    }

    if (conditions.length > 0) {
      sentSummaryFilterClauses = `AND ${conditions.join(" AND ")}`;
    }
  }

  // Determine which events to track based on channel
  let eventsToTrack: string[];
  const channel = filters?.channel;

  if (!channel) {
    // Default behavior: only track sent messages
    eventsToTrack = [InternalEventType.MessageSent];
  } else {
    switch (channel) {
      case ChannelType.Email:
        eventsToTrack = [
          InternalEventType.MessageSent,
          InternalEventType.EmailDelivered,
          InternalEventType.EmailOpened,
          InternalEventType.EmailClicked,
          InternalEventType.EmailBounced,
          InternalEventType.EmailMarkedSpam,
          InternalEventType.EmailDropped,
        ];
        break;
      case ChannelType.Sms:
        eventsToTrack = [
          InternalEventType.MessageSent,
          InternalEventType.SmsDelivered,
          InternalEventType.SmsFailed,
        ];
        break;
      case ChannelType.MobilePush:
      case ChannelType.Webhook:
      default:
        // For other channels, only track sent messages for now
        eventsToTrack = [InternalEventType.MessageSent];
        break;
    }
  }

  // Build channel-specific summary fields with cascading logic
  let summaryFields: string;
  if (!channel) {
    // Default: only sent messages
    summaryFields = `
      sum(toUInt64(has_sent)) as sent,
      0 as deliveries,
      0 as opens,
      0 as clicks,
      0 as bounces`;
  } else if (channel === ChannelType.Email) {
    summaryFields = `
      sum(toUInt64(has_delivered OR has_opened OR has_clicked)) as deliveries,
      sum(toUInt64(has_sent)) as sent,
      sum(toUInt64(has_opened OR has_clicked)) as opens,
      sum(toUInt64(has_clicked)) as clicks,
      sum(toUInt64(has_bounced)) as bounces`;
  } else if (channel === ChannelType.Sms) {
    summaryFields = `
      sum(toUInt64(has_delivered)) as deliveries,
      sum(toUInt64(has_sent)) as sent,
      0 as opens,
      0 as clicks,
      sum(toUInt64(has_bounced)) as bounces`;
  } else {
    // Other channels: only sent messages
    summaryFields = `
      sum(toUInt64(has_sent)) as sent,
      0 as deliveries,
      0 as opens,
      0 as clicks,
      0 as bounces`;
  }

  const query = `
    WITH sent_messages AS (
      SELECT
        ie.message_id AS origin_message_id
      FROM internal_events AS ie
      WHERE
        ie.workspace_id = ${workspaceIdParam}
        AND ie.processing_time >= parseDateTimeBestEffort(${qb.addQueryValue(startDate, "String")}, 'UTC')
        AND ie.processing_time <= parseDateTimeBestEffort(${qb.addQueryValue(endDate, "String")}, 'UTC')
        AND ie.event = '${InternalEventType.MessageSent}'
        AND ie.hidden = false
        ${sentSummaryFilterClauses}
    ),
    status_events AS (
      SELECT
        ie.origin_message_id,
        ie.event
      FROM internal_events AS ie
      WHERE
        ie.workspace_id = ${workspaceIdParam}
        AND ie.event IN (
          '${InternalEventType.EmailDelivered}',
          '${InternalEventType.SmsDelivered}',
          '${InternalEventType.EmailOpened}',
          '${InternalEventType.EmailClicked}',
          '${InternalEventType.EmailBounced}',
          '${InternalEventType.SmsFailed}'
        )
        AND ie.origin_message_id IN (SELECT origin_message_id FROM sent_messages)
    ),
    message_final_states AS (
      SELECT
        sm.origin_message_id,
        1 as has_sent,
        max(se.event IN ('${InternalEventType.EmailDelivered}', '${InternalEventType.SmsDelivered}')) as has_delivered,
        max(se.event = '${InternalEventType.EmailOpened}') as has_opened,
        max(se.event = '${InternalEventType.EmailClicked}') as has_clicked,
        max(se.event IN ('${InternalEventType.EmailBounced}', '${InternalEventType.SmsFailed}')) as has_bounced
      FROM sent_messages sm
      LEFT JOIN status_events se USING (origin_message_id)
      GROUP BY sm.origin_message_id
    )
    SELECT
      ${summaryFields}
    FROM message_final_states
  `;

  logger().debug(
    {
      query,
      workspaceId,
      startDate,
      endDate,
      channel,
      filters,
      eventsToTrack,
    },
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
    sent: string | number;
    opens: string | number;
    clicks: string | number;
    bounces: string | number;
  }>();

  const rawSummary = rows[0] || {
    deliveries: "0",
    sent: "0",
    opens: "0",
    clicks: "0",
    bounces: "0",
  };

  const summary = {
    deliveries:
      typeof rawSummary.deliveries === "string"
        ? parseInt(rawSummary.deliveries, 10)
        : rawSummary.deliveries,
    sent:
      typeof rawSummary.sent === "string"
        ? parseInt(rawSummary.sent, 10)
        : rawSummary.sent,
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

/**
 * Get journey editor statistics for a specific journey
 *
 * Returns counts for each node in the journey, with cascading logic:
 * - Click events count as: click + open + delivery
 * - Open events count as: open + delivery
 * - Delivery events count as: delivery
 * - Each message can only be counted once per state type per node
 */
export async function getJourneyEditorStats({
  workspaceId,
  journeyId,
  startDate,
  endDate,
}: GetJourneyEditorStatsRequest): Promise<GetJourneyEditorStatsResponse> {
  const qb = new ClickHouseQueryBuilder();
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const journeyIdParam = qb.addQueryValue(journeyId, "String");

  const query = `
    WITH message_events AS (
      SELECT
        event,
        if(event = '${InternalEventType.MessageSent}', message_id, origin_message_id) as origin_message_id,
        JSON_VALUE(properties, '$.nodeId') as node_id
      FROM internal_events
      WHERE
        workspace_id = ${workspaceIdParam}
        AND processing_time >= parseDateTimeBestEffort(${qb.addQueryValue(startDate, "String")}, 'UTC')
        AND processing_time <= parseDateTimeBestEffort(${qb.addQueryValue(endDate, "String")}, 'UTC')
        AND journey_id = ${journeyIdParam}
        AND event IN (
          '${InternalEventType.MessageSent}',
          '${InternalEventType.EmailDelivered}',
          '${InternalEventType.SmsDelivered}',
          '${InternalEventType.EmailOpened}',
          '${InternalEventType.EmailClicked}',
          '${InternalEventType.EmailBounced}',
          '${InternalEventType.SmsFailed}'
        )
        AND JSON_VALUE(properties, '$.nodeId') != ''
        AND hidden = false
    ),
    message_states_per_node AS (
      SELECT
        origin_message_id,
        node_id,
        countIf(event = '${InternalEventType.MessageSent}') > 0 as has_sent,
        countIf(event IN ('${InternalEventType.EmailDelivered}', '${InternalEventType.SmsDelivered}')) > 0 as has_delivered,
        countIf(event = '${InternalEventType.EmailOpened}') > 0 as has_opened,
        countIf(event = '${InternalEventType.EmailClicked}') > 0 as has_clicked,
        countIf(event IN ('${InternalEventType.EmailBounced}', '${InternalEventType.SmsFailed}')) > 0 as has_bounced
      FROM message_events
      WHERE origin_message_id != '' AND node_id != ''
      GROUP BY origin_message_id, node_id
    ),
    node_stats AS (
      SELECT
        node_id,
        'sent' as state,
        sum(toUInt64(has_sent)) as count
      FROM message_states_per_node
      WHERE has_sent = 1
      GROUP BY node_id

      UNION ALL

      SELECT
        node_id,
        'delivered' as state,
        sum(toUInt64(has_delivered OR has_opened OR has_clicked)) as count
      FROM message_states_per_node
      WHERE has_delivered = 1 OR has_opened = 1 OR has_clicked = 1
      GROUP BY node_id

      UNION ALL

      SELECT
        node_id,
        'opened' as state,
        sum(toUInt64(has_opened OR has_clicked)) as count
      FROM message_states_per_node
      WHERE has_opened = 1 OR has_clicked = 1
      GROUP BY node_id

      UNION ALL

      SELECT
        node_id,
        'clicked' as state,
        sum(toUInt64(has_clicked)) as count
      FROM message_states_per_node
      WHERE has_clicked = 1
      GROUP BY node_id

      UNION ALL

      SELECT
        node_id,
        'bounced' as state,
        sum(toUInt64(has_bounced)) as count
      FROM message_states_per_node
      WHERE has_bounced = 1
      GROUP BY node_id
    )
    SELECT
      node_id,
      state,
      count
    FROM node_stats
    ORDER BY node_id, state
  `;

  logger().debug(
    {
      query,
      workspaceId,
      journeyId,
      startDate,
      endDate,
    },
    "Executing journey editor stats query",
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
    node_id: string;
    state: string;
    count: string | number;
  }>();

  // Transform rows into the required format: Record<NodeId, Record<MessageState, number>>
  const nodeStats: Record<string, Record<string, number>> = {};

  // First, collect all unique node IDs from the raw results
  const nodeIds = new Set<string>();
  for (const row of rows) {
    nodeIds.add(row.node_id);
  }

  // Initialize all nodes with all possible states set to 0
  for (const nodeId of nodeIds) {
    nodeStats[nodeId] = {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
    };
  }

  // Populate with actual data
  for (const row of rows) {
    const nodeId = row.node_id;
    const { state } = row;
    const count =
      typeof row.count === "string" ? parseInt(row.count, 10) : row.count;

    const individualNode = nodeStats[nodeId];
    if (individualNode) {
      individualNode[state] = count;
    }
  }

  return { nodeStats };
}
