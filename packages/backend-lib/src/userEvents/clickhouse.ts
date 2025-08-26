import { clickhouseClient } from "../clickhouse";
import config from "../config";
import { NodeEnvEnum } from "../config/loader";
import logger from "../logger";
import {
  ComputedPropertyAssignment,
  InternalEventType,
  JSONValue,
} from "../types";

export interface InsertValue {
  processingTime?: string;
  messageRaw: Record<string, JSONValue>;
  messageId: string;
}

export const GROUP_TABLES = [
  `
    CREATE TABLE IF NOT EXISTS group_user_assignments (
      workspace_id LowCardinality(String),
      group_id String,
      user_id String,
      assigned Boolean,
      assigned_at DateTime64(3) DEFAULT now64(3)
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (
      workspace_id,
      group_id,
      user_id
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS user_group_assignments (
      workspace_id LowCardinality(String),
      group_id LowCardinality(String),
      user_id LowCardinality(String),
      assigned Boolean,
      assigned_at DateTime64(3) DEFAULT now64(3)
    )
    ENGINE = ReplacingMergeTree()
    ORDER BY (
      workspace_id,
      user_id,
      group_id
    );
  `,
];

export const GROUP_MATERIALIZED_VIEWS = [
  `
    create materialized view if not exists group_user_assignments_mv to group_user_assignments
    as select
      workspace_id,
      uev.user_id as group_id,
      JSONExtractString(uev.properties, 'userId') as user_id,
      JSONExtractBool(uev.properties, 'assigned') as assigned
    from user_events_v2 as uev
    where
      uev.event_type = 'track'
      and uev.event = '${InternalEventType.GroupUserAssignment}'
  `,
  `
    create materialized view if not exists user_group_assignments_mv to user_group_assignments
    as select
      workspace_id,
      JSONExtractString(uev.properties, 'groupId') as group_id,
      uev.user_or_anonymous_id as user_id,
      JSONExtractBool(uev.properties, 'assigned') as assigned
    from user_events_v2 as uev
    where
      uev.event_type = 'track'
      and uev.event = '${InternalEventType.UserGroupAssignment}'
  `,
];

// TODO route through kafka
export async function insertProcessedComputedProperties({
  assignments,
}: {
  assignments: ComputedPropertyAssignment[];
}) {
  await clickhouseClient().insert({
    table: `processed_computed_properties_v2 (workspace_id, user_id, type, computed_property_id, segment_value, user_property_value, processed_for, processed_for_type)`,
    values: assignments,
    format: "JSONEachRow",
    clickhouse_settings: { wait_end_of_query: 1 },
  });
}

export async function createUserEventsTables() {
  logger().info("Creating user events tables");
  const queries: string[] = [
    // This is the primary table for user events, which serves as the source of truth for user traits and behaviors.
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
          hidden Boolean DEFAULT JSONExtractBool(
            message_raw,
            'context',
            'hidden'
          ),
          processing_time DateTime64(3) DEFAULT now64(3),
          server_time DateTime64(3),
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
    // This table stores the intermediate state for computed properties, which
    // allows us to efficiently re-compute them incrementally, rather than
    // re-computing the entire segment or user property from scratch with each
    // polling period.
    //
    // Each computed property (segment or user property) maintains one or more
    // pieces of state, typically ~1 per segment or user property "node". For
    // example, a segment with N conditions joined with an "And" clause will
    // require N state id's.
    `
        CREATE TABLE IF NOT EXISTS computed_property_state_v2 (
          workspace_id LowCardinality(String),
          type Enum('user_property' = 1, 'segment' = 2),
          computed_property_id LowCardinality(String),
          state_id LowCardinality(String),
          user_id String,
          last_value AggregateFunction(argMax, String, DateTime64(3)),
          unique_count AggregateFunction(uniq, String),
          event_time DateTime64(3),
          grouped_message_ids AggregateFunction(groupArray, String),
          computed_at DateTime64(3)
        )
        ENGINE = AggregatingMergeTree()
        ORDER BY (
          workspace_id,
          type,
          computed_property_id,
          state_id,
          user_id,
          event_time
        );
      `,
    // This table stores the assignments of computed properties to users, json
    // strings in the case of user properties or booleans in the case of
    // segments.
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
    // Computed properties need to be "processed". There are several ways that a
    // computed property can be processed.
    //
    // 1. User property and segment assignments are replicated to postgres from clickhouse, for rapid row-wise reads.
    // 2. Segment assignments are used to trigger journeys.
    // 3. User property and segment assignments can be replicated to 3rd party systems like Hubspot etc.
    //
    // This table keeps track of which assignments have been processed, so that
    // we can safely retry only the pending effects upon failure.
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
    // Keeps track of which computed properties have been updated recently, so
    // that we can efficiently assign new computed property values for only the
    // properties which have had their states updated.
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
        TTL toStartOfDay(computed_at) + interval 24 hour;
      `,
    // Keeps track of which user property and segment assignments have been
    // updated so that we can decide which computed properties need to be
    // re-processed.
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
        TTL toStartOfDay(assigned_at) + interval 24 hour;
      `,
    // This table maintains indexes for specialized computed properties that
    // involve numerical values and / or dates e.g. segments using the the
    // "Within" trait operator
    `
        CREATE TABLE IF NOT EXISTS computed_property_state_index (
            workspace_id LowCardinality(String),
            type Enum('user_property' = 1, 'segment' = 2),
            computed_property_id LowCardinality(String),
            state_id LowCardinality(String),
            user_id String,
            indexed_value Int64,
            INDEX primary_idx indexed_value TYPE minmax GRANULARITY 4
        )
        ENGINE = ReplacingMergeTree()
        ORDER BY (
            workspace_id,
            type,
            computed_property_id,
            state_id,
            user_id
        );
      `,
    // Because segments can be represented as a tree of boolean values, joined
    // by And and Or clauses, we store that tree's node's values separately.
    `
        CREATE TABLE IF NOT EXISTS resolved_segment_state (
            workspace_id LowCardinality(String),
            segment_id LowCardinality(String),
            state_id LowCardinality(String),
            user_id String,
            segment_state_value Boolean,
            max_event_time DateTime64(3),
            INDEX segment_state_value_idx segment_state_value TYPE minmax GRANULARITY 4,
            computed_at DateTime64(3),
            INDEX computed_at_idx computed_at TYPE minmax GRANULARITY 4
        )
        ENGINE = ReplacingMergeTree()
        ORDER BY (
            workspace_id,
            segment_id,
            state_id,
            user_id
        );
      `,
    // This table stores internal events with pre-parsed fields for efficient querying
    // Only processes DF-prefixed track events which contain templateId, broadcastId, etc.
    `
      CREATE TABLE IF NOT EXISTS internal_events (
        workspace_id String,
        user_or_anonymous_id String,
        user_id String,
        anonymous_id String,
        message_id String,
        event String,
        event_time DateTime64(3),
        processing_time DateTime64(3),
        properties String,
        template_id String,
        broadcast_id String,
        journey_id String,
        triggering_message_id String,
        channel_type String,
        delivery_to String,
        delivery_from String,
        origin_message_id String,
        hidden Boolean,
        INDEX idx_template_id template_id TYPE bloom_filter(0.01) GRANULARITY 4,
        INDEX idx_broadcast_id broadcast_id TYPE bloom_filter(0.01) GRANULARITY 4,
        INDEX idx_journey_id journey_id TYPE bloom_filter(0.01) GRANULARITY 4
      )
      ENGINE = MergeTree()
      ORDER BY (workspace_id, processing_time, event, user_or_anonymous_id, message_id);
    `,
    ...GROUP_TABLES,
  ];

  await Promise.all(
    queries.map((query) =>
      clickhouseClient().exec({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      }),
    ),
  );

  // These materialized views help to move data to "updated_" tables, which
  // track changes in the parent table.
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
      create materialized view if not exists updated_computed_property_state_v2_mv to updated_computed_property_state
      as select
        workspace_id,
        type,
        computed_property_id,
        state_id,
        user_id,
        computed_at
      from computed_property_state_v2
      group by
        workspace_id,
        type,
        computed_property_id,
        state_id,
        user_id,
        computed_at;
    `,
    // Materialized view that populates internal_events table with DF-prefixed track events
    `
      CREATE MATERIALIZED VIEW IF NOT EXISTS internal_events_mv
      TO internal_events
      AS SELECT
        workspace_id,
        user_or_anonymous_id,
        user_id,
        anonymous_id,
        message_id,
        event,
        event_time,
        processing_time,
        properties,
        JSONExtractString(properties, 'templateId') as template_id,
        JSONExtractString(properties, 'broadcastId') as broadcast_id,
        JSONExtractString(properties, 'journeyId') as journey_id,
        JSONExtractString(properties, 'triggeringMessageId') as triggering_message_id,
        JSONExtractString(properties, 'variant', 'type') as channel_type,
        JSONExtractString(properties, 'variant', 'to') as delivery_to,
        JSONExtractString(properties, 'variant', 'from') as delivery_from,
        JSONExtractString(properties, 'messageId') as origin_message_id,
        hidden
      FROM user_events_v2
      WHERE event_type = 'track' AND startsWith(event, 'DF');
    `,
    ...GROUP_MATERIALIZED_VIEWS,
  ];

  await Promise.all(
    mvQueries.map((query) =>
      clickhouseClient().exec({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      }),
    ),
  );
}

export async function dropKafkaTables() {
  logger().info("Dropping kafka tables");
  const dropQueries = [
    "DROP TABLE IF EXISTS user_events_mv_v2",
    "DROP TABLE IF EXISTS user_events_queue_v2",
  ];

  for (const query of dropQueries) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await clickhouseClient().exec({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      });
      logger().info({ query }, "Successfully executed query");
    } catch (error) {
      logger().error({ err: error, query }, "Failed to execute query");
      // Continue with next query even if this one fails
    }
  }
}

export async function createKafkaTables({
  ingressTopic,
}: {
  ingressTopic?: string;
} = {}) {
  if (!ingressTopic || config().writeMode !== "kafka") {
    logger().info("Skipping Kafka table creation - not in kafka write mode");
    return;
  }

  logger().info("Creating Kafka tables");

  const kafkaBrokers =
    config().nodeEnv === NodeEnvEnum.Test ||
    config().nodeEnv === NodeEnvEnum.Development
      ? "kafka:29092"
      : config().kafkaBrokers.join(",");

  // Build kafka settings - SASL authentication is configured globally in ClickHouse config.xml
  const kafkaSettings = `
                kafka_thread_per_consumer = 0,
                kafka_num_consumers = 1,
                date_time_input_format = 'best_effort',
                input_format_skip_unknown_fields = 1`;

  const queries = [
    // This table is used in the kafka write mode to buffer messages from kafka
    // to clickhouse. It's useful for processing a high volume of messages
    // without burdening clickhouse with excessive memory usage.
    `
      CREATE TABLE IF NOT EXISTS user_events_queue_v2
      (message_raw String, workspace_id String, message_id String)
      ENGINE = Kafka('${kafkaBrokers}', '${ingressTopic}', '${ingressTopic}-clickhouse',
                'JSONEachRow') settings${kafkaSettings};
    `,
    // Materialized view to move data from Kafka queue to main table
    `
      CREATE MATERIALIZED VIEW IF NOT EXISTS user_events_mv_v2
      TO user_events_v2 AS
      SELECT *
      FROM user_events_queue_v2;
    `,
  ];

  await Promise.all(
    queries.map((query) =>
      clickhouseClient().exec({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      }),
    ),
  );

  logger().info("Successfully created Kafka tables");
}
