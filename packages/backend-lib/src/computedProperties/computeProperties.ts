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
        anonymous_id Nullable(String) DEFAULT JSONExtract(
          message_raw, 
          'anonymousId', 
          'Nullable(String)'
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
      CREATE TABLE IF NOT EXISTS computed_property_assignments_v2 (
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
  ];
}

export async function computeState() {}

export async function computeAssignments() {}

export async function processAssignments() {}
