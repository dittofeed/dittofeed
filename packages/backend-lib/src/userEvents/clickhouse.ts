import { clickhouseClient } from "../clickhouse";
import config from "../config";
import prisma from "../prisma";
import { JSONValue } from "../types";

const userEventsColumns = `
  event_type Enum('identify' = 1, 'track' = 2, 'page' = 3, 'screen' = 4, 'group' = 5, 'alias' = 6) DEFAULT JSONExtract(message_raw, 'type', 'Enum(\\'identify\\' = 1, \\'track\\' = 2, \\'page\\' = 3, \\'screen\\' = 4, \\'group\\' = 5, \\'alias\\' = 6)'),
  event Nullable(String) DEFAULT JSONExtract(message_raw, 'event', 'Nullable(String)'),
  event_time DateTime64 DEFAULT assumeNotNull(parseDateTime64BestEffortOrNull(JSONExtractString(message_raw, 'timestamp'), 3)),
  user_id Nullable(String) DEFAULT JSONExtract(message_raw, 'userId', 'Nullable(String)'),
  anonymous_id Nullable(String) DEFAULT JSONExtract(message_raw, 'anonymousId', 'Nullable(String)'),
  user_or_anonymous_id String DEFAULT assumeNotNull(coalesce(JSONExtract(message_raw, 'userId', 'Nullable(String)'), JSONExtract(message_raw, 'anonymousId', 'Nullable(String)'))),
  processing_time DateTime64(3) DEFAULT now64(3),
  message_raw String,
  workspace_id String
`;

/**
 * Use materialized views in clickhouse
 * store segment as an attribute
 *
 * - use clickhouse maps
 * - preparse json
 * - can store mix of parsed and unparsed
 *
 *  user
 *  segment
 *  last_update_time min function
 *  order by (user, segment)
 *
 * materialized view calculates up to date values
 * live query finds users with updated values in polling period
 *
 * send denis a copy of table structures
 *
 */

interface InsertValue {
  processingTime?: string;
  messageRaw: Record<string, JSONValue>;
}

export function buildUserEventsTableName(tableVersion: string) {
  return `user_events_${tableVersion}`;
}

export async function insertUserEvents({
  workspaceId,
  tableVersion: tableVersionParam,
  events,
}: {
  workspaceId: string;
  tableVersion?: string;
  events: InsertValue[];
}) {
  let tableVersion = tableVersionParam;
  if (!tableVersion) {
    const currentTable = await prisma.currentUserEventsTable.findUnique({
      where: {
        workspaceId,
      },
    });

    if (!currentTable) {
      return;
    }
    tableVersion = currentTable.version;
  }
  await clickhouseClient().insert({
    table: `user_events_${tableVersion} (message_raw, processing_time, workspace_id)`,
    values: events.map((e) => {
      const value: {
        message_raw: string;
        processing_time: string | null;
        workspace_id: string;
      } = {
        workspace_id: workspaceId,
        message_raw: JSON.stringify(e.messageRaw),
        processing_time: e.processingTime ?? null,
      };
      return value;
    }),
    format: "JSONEachRow",
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
        ORDER BY (workspace_id, processing_time, user_or_anonymous_id, event_time);
      `,
    `
        CREATE TABLE IF NOT EXISTS computed_property_assignments (
            workspace_id LowCardinality(String),
            user_id String,
            computed_property_id LowCardinality(String),
            segment_value Boolean,
            user_property_value String,
            processed Boolean DEFAULT False,
            assigned_at DateTime64(3) DEFAULT now64(3)
        ) Engine = ReplacingMergeTree()
        ORDER BY (workspace_id, computed_property_id, user_id, processed);
      `,
  ];

  const kafkaBrokers =
    config().nodeEnv === "test" || config().nodeEnv === "development"
      ? "kafka:29092"
      : config().kafkaBrokers.join(",");

  if (ingressTopic) {
    // TODO modify kafka consumer settings
    queries.push(`
        CREATE TABLE IF NOT EXISTS user_events_queue_${tableVersion}
        (message_raw String, workspace_id String)
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

  if (ingressTopic) {
    const mvQuery = `
      CREATE MATERIALIZED VIEW IF NOT EXISTS user_events_mv_${tableVersion}
      TO user_events_${tableVersion} AS
      SELECT *
      FROM user_events_queue_${tableVersion};
    `;

    await clickhouseClient().exec({
      query: mvQuery,
      clickhouse_settings: { wait_end_of_query: 1 },
    });
  }
}
