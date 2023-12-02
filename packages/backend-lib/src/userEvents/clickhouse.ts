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
    const currentTable = await prisma().currentUserEventsTable.findUnique({
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
    table: `user_events_${tableVersion} (message_raw, processing_time, workspace_id, message_id)`,
    values: events.map((e) => {
      const value: {
        message_raw: string;
        processing_time: string | null;
        workspace_id: string;
        message_id: string;
      } = {
        workspace_id: workspaceId,
        message_raw: JSON.stringify(e.messageRaw),
        processing_time: e.processingTime ?? null,
        message_id: e.messageId,
      };
      logger().debug(
        {
          event: value,
        },
        "inserted user event"
      );
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
