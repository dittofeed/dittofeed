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
        anonymous_id String DEFAULT JSONExtract(
          message_raw, 
          'anonymousId', 
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
        last_value AggregateFunction(argMax, String, DateTime),
        unique_count AggregateFunction(uniq, String),
        INDEX computed_at_idx last_assigned_at TYPE minmax GRANULARITY 4
      )
      ENGINE = AggregatingMergeTree()
      PARTITION BY toYYYYMM(last_computed_at)
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
        segment_value AggregateFunction(argMax, Boolean, DateTime),
        user_property_value AggregateFunction(argMax, String, DateTime),
        last_assigned_at AggregateFunction(max, DateTime),
        INDEX assigned_at_idx last_assigned_at TYPE minmax GRANULARITY 4
      )
      ENGINE = AggregatingMergeTree()
      PARTITION BY toYYYYMM(last_assigned_at)
      ORDER BY (
        workspace_id,
        type,
        computed_property_id,
        user_id
      );
    `,
  ];
}

export async function computeState() {}

export async function computeAssignments() {}

export async function processAssignments() {}
