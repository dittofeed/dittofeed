import { clickhouseClient, ClickHouseQueryBuilder } from "../clickhouse";
import { SavdUserPropertyResource, SavedSegmentResource } from "../types";

// TODO pull out into separate files
export async function createTables() {
  const queries: string[] = [
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
        workspace_id String
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
        user_id String,
        last_value AggregateFunction(argMax, String, DateTime64(3)),
        unique_count AggregateFunction(uniq, String),
        computed_at DateTime64(3) DEFAULT now64(3),
        INDEX computed_at_idx computed_at TYPE minmax GRANULARITY 4
      )
      ENGINE = AggregatingMergeTree()
      PARTITION BY toYYYYMM(computed_at)
      ORDER BY (
        workspace_id,
        type,
        computed_property_id,
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
        type,
        computed_property_id,
        user_id
      );
    `,
  ];

  await Promise.all(
    queries.map((query) =>
      clickhouseClient().exec({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      })
    )
  );
}

export async function dropTables() {
  const queries: string[] = [
    `
      DROP TABLE IF EXISTS user_events_v2;
    `,
    `
      DROP TABLE IF EXISTS computed_property_state;
    `,
    `
      DROP TABLE IF EXISTS computed_property_assignments_v2;
    `,
    `
      DROP TABLE IF EXISTS processed_computed_properties_v2;
    `,
  ];

  await Promise.all(
    queries.map((query) =>
      clickhouseClient().exec({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      })
    )
  );
}

export async function computeState({
  workspaceId,
  segments,
  userProperties,
}: {
  workspaceId: string;
  segments: SavedSegmentResource[];
  userProperties: SavdUserPropertyResource[];
}) {
  const queries: {
    query: string;
    queryBuilder: ClickHouseQueryBuilder;
  }[] = [];

  for (const segment of segments) {
    const qb = new ClickHouseQueryBuilder();
  }

  for (const userProperty of userProperties) {
    const qb = new ClickHouseQueryBuilder();
    switch (userProperty.definition.type) {
      default:
        throw new Error(
          `Unhandled user property type: ${userProperty.definition.type}`
        );
    }
  }
}

export async function computeAssignments() {}

export async function processAssignments() {}
