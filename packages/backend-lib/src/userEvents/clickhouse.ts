import { clickhouseClient } from "../clickhouse";
import config from "../config";
import { NodeEnvEnum } from "../config/loader";
import logger from "../logger";
import prisma from "../prisma";
import { ComputedPropertyAssignment, JSONValue } from "../types";

const userEventsColumns = `
  event_type Enum('identify' = 1, 'track' = 2, 'page' = 3, 'screen' = 4, 'group' = 5, 'alias' = 6) DEFAULT JSONExtract(message_raw, 'type', 'Enum(\\'identify\\' = 1, \\'track\\' = 2, \\'page\\' = 3, \\'screen\\' = 4, \\'group\\' = 5, \\'alias\\' = 6)'),
  event Nullable(String) DEFAULT JSONExtract(message_raw, 'event', 'Nullable(String)'),
  event_time DateTime64 DEFAULT assumeNotNull(parseDateTime64BestEffortOrNull(JSONExtractString(message_raw, 'timestamp'), 3)),
  user_id Nullable(String) DEFAULT JSONExtract(message_raw, 'userId', 'Nullable(String)'),
  message_id String,
  anonymous_id Nullable(String) DEFAULT JSONExtract(message_raw, 'anonymousId', 'Nullable(String)'),
  user_or_anonymous_id String DEFAULT assumeNotNull(coalesce(JSONExtract(message_raw, 'userId', 'Nullable(String)'), JSONExtract(message_raw, 'anonymousId', 'Nullable(String)'))),
  processing_time DateTime64(3) DEFAULT now64(3),
  message_raw String,
  workspace_id String
`;

export interface InsertValue {
  processingTime?: string;
  messageRaw: Record<string, JSONValue>;
  messageId: string;
}

export function buildUserEventsTableName(tableVersion: string) {
  return `user_events_${tableVersion}`;
}

// TODO route through kafka
export async function insertProcessedComputedProperties({
  assignments,
  tableVersion,
}: {
  assignments: ComputedPropertyAssignment[];
  tableVersion?: string;
}) {
  const tableName = ["processed_computed_properties"];
  if (tableVersion) {
    tableName.push(tableVersion);
  }
  await clickhouseClient().insert({
    table: `${tableName.join(
      "_"
    )} (workspace_id, user_id, type, computed_property_id, segment_value, user_property_value, processed_for, processed_for_type)`,
    values: assignments,
    format: "JSONEachRow",
    clickhouse_settings: { wait_end_of_query: 1 },
  });
}

export async function createUserEventsTables({
  tableVersion,
  ingressTopic,
}: {
  tableVersion: string;
  ingressTopic?: string;
}) {
  const queries: string[] = [
    `
        CREATE TABLE IF NOT EXISTS ${buildUserEventsTableName(tableVersion)}
        (${userEventsColumns})
        ENGINE MergeTree()
        ORDER BY (workspace_id, processing_time, user_or_anonymous_id, event_time, message_id);
      `,
    `
        CREATE TABLE IF NOT EXISTS computed_property_assignments (
            workspace_id LowCardinality(String),
            user_id String,
            type Enum('user_property' = 1, 'segment' = 2),
            computed_property_id LowCardinality(String),
            segment_value Boolean,
            user_property_value String,
            assigned_at DateTime64(3) DEFAULT now64(3)
        ) Engine = ReplacingMergeTree()
        ORDER BY (workspace_id, computed_property_id, user_id);
      `,
    `
        CREATE TABLE IF NOT EXISTS processed_computed_properties (
            workspace_id LowCardinality(String),
            user_id String,
            type Enum('user_property' = 1, 'segment' = 2),
            computed_property_id LowCardinality(String),
            segment_value Boolean,
            user_property_value String,
            processed_for LowCardinality(String),
            processed_for_type LowCardinality(String),
            processed_at DateTime64(3) DEFAULT now64(3)
        ) Engine = ReplacingMergeTree()
        ORDER BY (workspace_id, computed_property_id, processed_for_type, processed_for, user_id);
      `,
    `
        CREATE TABLE IF NOT EXISTS user_events_v2 (
          event_type Enum(
            'identify' = 1,
            'track' = 2,
            'page' = 3,
            'screen' = 4,
            'group' = 5,
            'alias' = 6
          ) DEFAULT JSONExtract(
            message_raw,
            'type',
            'Enum(\\'identify\\' = 1, \\'track\\' = 2, \\'page\\' = 3, \\'screen\\' = 4, \\'group\\' = 5, \\'alias\\' = 6)'
          ),
          event String DEFAULT JSONExtract(
            message_raw,
            'event',
            'String'
          ),
          event_time DateTime64 DEFAULT assumeNotNull(
            parseDateTime64BestEffortOrNull(
              JSONExtractString(message_raw, 'timestamp'),
              3
            )
          ),
          message_id String,
          user_id String DEFAULT JSONExtract(
            message_raw,
            'userId',
            'String'
          ),
          anonymous_id String DEFAULT JSONExtract(
            message_raw,
            'anonymousId',
            'String'
          ),
          user_or_anonymous_id String DEFAULT assumeNotNull(
            coalesce(
              JSONExtract(message_raw, 'userId', 'Nullable(String)'),
              JSONExtract(message_raw, 'anonymousId', 'Nullable(String)')
            )
          ),
          properties String DEFAULT assumeNotNull(
            coalesce(
              JSONExtract(message_raw, 'traits', 'Nullable(String)'),
              JSONExtract(message_raw, 'properties', 'Nullable(String)')
            )
          ),
          processing_time DateTime64(3) DEFAULT now64(3),
          message_raw String,
          workspace_id String,
          INDEX message_id_idx message_id TYPE minmax GRANULARITY 4
        )
        ENGINE = MergeTree()
        ORDER BY (
          workspace_id,
          processing_time,
          user_or_anonymous_id,
          event_time,
          message_id
      );
      `,
    `
        CREATE TABLE IF NOT EXISTS computed_property_state (
          workspace_id LowCardinality(String),
          type Enum('user_property' = 1, 'segment' = 2),
          computed_property_id LowCardinality(String),
          state_id LowCardinality(String),
          user_id String,
          last_value AggregateFunction(argMax, String, DateTime64(3)),
          unique_count AggregateFunction(uniq, String),
          max_event_time AggregateFunction(max, DateTime64(3)),
          grouped_message_ids AggregateFunction(groupArray, String),
          computed_at DateTime64(3)
        )
        ENGINE = AggregatingMergeTree()
        ORDER BY (
          workspace_id,
          type,
          computed_property_id,
          state_id,
          user_id
        );
      `,
    `
        CREATE TABLE IF NOT EXISTS computed_property_assignments_v2 (
          workspace_id LowCardinality(String),
          type Enum('user_property' = 1, 'segment' = 2),
          computed_property_id LowCardinality(String),
          user_id String,
          segment_value Boolean,
          user_property_value String,
          max_event_time DateTime64(3),
          assigned_at DateTime64(3) DEFAULT now64(3),
        )
        ENGINE = ReplacingMergeTree()
        ORDER BY (
          workspace_id,
          type,
          computed_property_id,
          user_id
        );
      `,
    `
        CREATE TABLE IF NOT EXISTS processed_computed_properties_v2 (
          workspace_id LowCardinality(String),
          user_id String,
          type Enum('user_property' = 1, 'segment' = 2),
          computed_property_id LowCardinality(String),
          processed_for LowCardinality(String),
          processed_for_type LowCardinality(String),
          segment_value Boolean,
          user_property_value String,
          max_event_time DateTime64(3),
          processed_at DateTime64(3) DEFAULT now64(3),
        )
        ENGINE = ReplacingMergeTree()
        ORDER BY (
          workspace_id,
          computed_property_id,
          processed_for_type,
          processed_for,
          user_id
        );
      `,
    `
        create table if not exists updated_computed_property_state(
          workspace_id LowCardinality(String),
          type Enum('user_property' = 1, 'segment' = 2),
          computed_property_id LowCardinality(String),
          state_id LowCardinality(String),
          user_id String,
          computed_at DateTime64(3)
        ) Engine=MergeTree
        partition by toYYYYMMDD(computed_at)
        order by computed_at
        TTL toStartOfDay(computed_at) + interval 100 day;
      `,
    `
        create table if not exists updated_property_assignments_v2(
          workspace_id LowCardinality(String),
          type Enum('user_property' = 1, 'segment' = 2),
          computed_property_id LowCardinality(String),
          user_id String,
          assigned_at DateTime64(3)
        ) Engine=MergeTree
        partition by toYYYYMMDD(assigned_at)
        order by assigned_at
        TTL toStartOfDay(assigned_at) + interval 100 day;
      `,
  ];

  const kafkaBrokers =
    config().nodeEnv === NodeEnvEnum.Test ||
    config().nodeEnv === NodeEnvEnum.Development
      ? "kafka:29092"
      : config().kafkaBrokers.join(",");

  if (ingressTopic) {
    // TODO modify kafka consumer settings
    queries.push(`
        CREATE TABLE IF NOT EXISTS user_events_queue_${tableVersion}
        (message_raw String, workspace_id String, message_id String)
        ENGINE = Kafka('${kafkaBrokers}', '${ingressTopic}', '${ingressTopic}-clickhouse',
                  'JSONEachRow') settings
                  kafka_thread_per_consumer = 0,
                  kafka_num_consumers = 1,
                  date_time_input_format = 'best_effort',
                  input_format_skip_unknown_fields = 1;
      `);
  }

  await Promise.all(
    queries.map((query) =>
      clickhouseClient().exec({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      })
    )
  );

  const mvQueries: string[] = [
    `
      create materialized view if not exists updated_property_assignments_v2_mv to updated_property_assignments_v2
      as select
        workspace_id,
        type,
        computed_property_id,
        user_id,
        assigned_at
      from computed_property_assignments_v2
      group by
        workspace_id,
        type,
        computed_property_id,
        user_id,
        assigned_at;
    `,
    `
      create materialized view if not exists updated_computed_property_state_mv to updated_computed_property_state
      as select
        workspace_id,
        type,
        computed_property_id,
        state_id,
        user_id,
        computed_at
      from computed_property_state
      group by
        workspace_id,
        type,
        computed_property_id,
        state_id,
        user_id,
        computed_at;
    `,
  ];
  if (ingressTopic) {
    mvQueries.push(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS user_events_mv_${tableVersion}
      TO user_events_${tableVersion} AS
      SELECT *
      FROM user_events_queue_${tableVersion};
    `);
  }

  await Promise.all(
    mvQueries.map((query) =>
      clickhouseClient().exec({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      })
    )
  );
}
