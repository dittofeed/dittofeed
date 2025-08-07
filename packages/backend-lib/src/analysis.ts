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
      const channelConditions: string[] = [];

      filters.channels.forEach((channel) => {
        if (channel === "Email") {
          channelConditions.push(`(
            (event = '${InternalEventType.MessageSent}' AND JSON_VALUE(properties, '$.variant.type') = 'Email') OR
            event IN ('${InternalEventType.EmailDelivered}', '${InternalEventType.EmailOpened}', '${InternalEventType.EmailClicked}', '${InternalEventType.EmailBounced}', '${InternalEventType.EmailMarkedSpam}', '${InternalEventType.EmailDropped}')
          )`);
        } else if (channel === "Sms") {
          channelConditions.push(`(
            (event = '${InternalEventType.MessageSent}' AND JSON_VALUE(properties, '$.variant.type') = 'Sms') OR
            event IN ('${InternalEventType.SmsDelivered}', '${InternalEventType.SmsFailed}')
          )`);
        } else {
          // For other channels, only include sent messages of that type
          channelConditions.push(
            `(event = '${InternalEventType.MessageSent}' AND JSON_VALUE(properties, '$.variant.type') = ${qb.addQueryValue(channel, "String")})`,
          );
        }
      });

      if (channelConditions.length > 0) {
        conditions.push(`(${channelConditions.join(" OR ")})`);
      }
    }

    if (filters.providers && filters.providers.length > 0) {
      conditions.push(
        `JSON_VALUE(properties, '$.variant.provider.type') IN ${qb.addQueryValue(filters.providers, "Array(String)")}`,
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

  // Build select clause for grouping
  let selectClause = "'' as groupKey";

  if (groupBy) {
    switch (groupBy) {
      case "journey":
        selectClause = "JSONExtractString(properties, 'journeyId') as groupKey";
        break;
      case "broadcast":
        selectClause =
          "JSONExtractString(properties, 'broadcastId') as groupKey";
        break;
      case "messageTemplate":
        selectClause =
          "JSONExtractString(properties, 'templateId') as groupKey";
        break;
      case "channel":
        selectClause = "JSON_VALUE(properties, '$.variant.type') as groupKey";
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

  // Determine the event types to include based on groupBy
  let eventStates: string[];
  if (groupBy === "messageState") {
    // When grouping by state, we need to handle each state separately
    eventStates = [
      InternalEventType.MessageSent,
      InternalEventType.EmailDelivered,
      InternalEventType.SmsDelivered,
      InternalEventType.EmailOpened,
      InternalEventType.EmailClicked,
      InternalEventType.EmailBounced,
      InternalEventType.SmsFailed,
    ];
  } else {
    // When not grouping by state, aggregate all events into a single count
    eventStates = [
      InternalEventType.MessageSent,
      InternalEventType.EmailDelivered,
      InternalEventType.SmsDelivered,
      InternalEventType.EmailOpened,
      InternalEventType.EmailClicked,
      InternalEventType.EmailBounced,
      InternalEventType.SmsFailed,
    ];
  }

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

  // Build a simpler query that handles cascading logic correctly
  const query = `
    WITH message_events AS (
      SELECT
        processing_time,
        event,
        properties,
        if(event = '${InternalEventType.MessageSent}', message_id, JSON_VALUE(properties, '$.messageId')) as origin_message_id,
        ${groupSelectClause.replace(/properties/g, "uev.properties")}
      FROM user_events_v2 AS uev
      WHERE
        workspace_id = ${workspaceIdParam}
        AND processing_time >= parseDateTimeBestEffort(${qb.addQueryValue(startDate, "String")}, 'UTC')
        AND processing_time <= parseDateTimeBestEffort(${qb.addQueryValue(endDate, "String")}, 'UTC')
        AND event_type = 'track'
        AND event IN (${eventStates.map((e) => `'${e}'`).join(", ")})
        ${filterClauses.replace(/properties/g, "uev.properties")}
    ),
    message_states_per_message AS (
      SELECT
        origin_message_id,
        groupKey,
        ${timeFunction} as timestamp,
        countIf(event = '${InternalEventType.MessageSent}') > 0 as has_sent,
        countIf(event IN ('${InternalEventType.EmailDelivered}', '${InternalEventType.SmsDelivered}')) > 0 as has_delivered,
        countIf(event = '${InternalEventType.EmailOpened}') > 0 as has_opened,
        countIf(event = '${InternalEventType.EmailClicked}') > 0 as has_clicked,
        countIf(event IN ('${InternalEventType.EmailBounced}', '${InternalEventType.SmsFailed}')) > 0 as has_bounced
      FROM message_events
      WHERE origin_message_id != ''
      GROUP BY origin_message_id, groupKey, timestamp
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

    if (filters.channel) {
      conditions.push(
        `(event != '${InternalEventType.MessageSent}' OR JSON_VALUE(properties, '$.variant.type') = ${qb.addQueryValue(filters.channel, "String")})`,
      );
    }

    if (filters.providers && filters.providers.length > 0) {
      conditions.push(
        `JSON_VALUE(properties, '$.variant.provider.type') IN ${qb.addQueryValue(filters.providers, "Array(String)")}`,
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

  const eventsInClause = eventsToTrack.map((event) => `'${event}'`).join(", ");

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
    WITH message_events AS (
      SELECT
        event,
        if(event = '${InternalEventType.MessageSent}', message_id, JSON_VALUE(properties, '$.messageId')) as origin_message_id
      FROM user_events_v2
      WHERE
        workspace_id = ${workspaceIdParam}
        AND event_time >= parseDateTimeBestEffort(${qb.addQueryValue(startDate, "String")}, 'UTC')
        AND event_time <= parseDateTimeBestEffort(${qb.addQueryValue(endDate, "String")}, 'UTC')
        AND event_type = 'track'
        AND event IN (${eventsInClause})
        ${filterClauses}
    ),
    message_final_states AS (
      SELECT
        origin_message_id,
        countIf(event = '${InternalEventType.MessageSent}') > 0 as has_sent,
        countIf(event IN ('${InternalEventType.EmailDelivered}', '${InternalEventType.SmsDelivered}')) > 0 as has_delivered,
        countIf(event = '${InternalEventType.EmailOpened}') > 0 as has_opened,
        countIf(event = '${InternalEventType.EmailClicked}') > 0 as has_clicked,
        countIf(event IN ('${InternalEventType.EmailBounced}', '${InternalEventType.SmsFailed}')) > 0 as has_bounced
      FROM message_events
      WHERE origin_message_id != ''
      GROUP BY origin_message_id
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
        if(event = '${InternalEventType.MessageSent}', message_id, JSON_VALUE(properties, '$.messageId')) as origin_message_id,
        JSON_VALUE(properties, '$.nodeId') as node_id
      FROM user_events_v2
      WHERE
        workspace_id = ${workspaceIdParam}
        AND processing_time >= parseDateTimeBestEffort(${qb.addQueryValue(startDate, "String")}, 'UTC')
        AND processing_time <= parseDateTimeBestEffort(${qb.addQueryValue(endDate, "String")}, 'UTC')
        AND event_type = 'track'
        AND JSONExtractString(properties, 'journeyId') = ${journeyIdParam}
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
    const state = row.state;
    const count = typeof row.count === "string" ? parseInt(row.count, 10) : row.count;

    if (nodeStats[nodeId]) {
      nodeStats[nodeId][state] = count;
    }
  }

  return { nodeStats };
}
