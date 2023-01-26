import { createClient } from "@clickhouse/client";
import { randomUUID } from "crypto";

import KafkaSkaffold from "../../test/kafkaSkaffold";
import config from "../config";
import { JSONValue } from "../types";

jest.setTimeout(10000);

describe("computed properties", () => {
  const k = new KafkaSkaffold();
  const { computedPropertiesTopicName, userEventsTopicName } = config();
  const clickhouse = createClient({});

  beforeAll(async () => {
    await k.setupBeforeAll();
  });

  afterAll(async () => {
    await k.teardownAfterAll();
    await clickhouse.close();
  });

  describe("when you've created a computed property and send a user event", () => {
    beforeEach(async () => {
      await k.createTopics([
        config().userEventsTopicName,
        config().computedPropertiesTopicName,
      ]);

      const createCHTables: string[] = [
        `
        CREATE TABLE IF NOT EXISTS dittofeed.user_events
        (event_type Enum('Identify' = 1, 'Page' = 2), created_at DateTime)
        ENGINE MergeTree()
        ORDER BY (created_at)
      `,
        `
        CREATE TABLE IF NOT EXISTS dittofeed.user_events_queue
        (event_type Enum('Identify' = 1, 'Page' = 2), created_at DateTime)
        ENGINE = Kafka('kafka:29092', '${k.getTopicName(
          userEventsTopicName
        )}', '${k.getTopicName(userEventsTopicName)}-clickhouse',
                  'JSONEachRow') settings
                  kafka_thread_per_consumer = 0,
                  kafka_num_consumers = 1,
                  date_time_input_format = 'best_effort',
                  input_format_skip_unknown_fields = 1;
      `,
        `
        CREATE TABLE IF NOT EXISTS dittofeed.user_events_out_queue
        (event_type Enum('Identify' = 1, 'Page' = 2), created_at DateTime)
        ENGINE = Kafka('kafka:29092', '${k.getTopicName(
          computedPropertiesTopicName
        )}', '${k.getTopicName(computedPropertiesTopicName)}-clickhouse',
                  'JSONEachRow') settings kafka_thread_per_consumer = 0, kafka_num_consumers = 1;
      `,
      ];

      await Promise.all(
        createCHTables.map((query) =>
          clickhouse.exec({
            query,
            clickhouse_settings: { wait_end_of_query: 1 },
          })
        )
      );

      const createCHMV: string[] = [
        `
        CREATE MATERIALIZED VIEW IF NOT EXISTS dittofeed.user_events_out_mv TO dittofeed.user_events_out_queue AS
        SELECT event_type, created_at FROM dittofeed.user_events FORMAT JsonEachRow;
      `,
        `
        CREATE MATERIALIZED VIEW IF NOT EXISTS dittofeed.user_events_mv TO dittofeed.user_events AS
        SELECT *
        FROM dittofeed.user_events_queue;
      `,
      ];

      await Promise.all(
        createCHMV.map((query) =>
          clickhouse.exec({
            query,
            clickhouse_settings: { wait_end_of_query: 1 },
          })
        )
      );
    });

    it("receives computed property updates", async () => {
      const userId = randomUUID();

      await k.sendJson(userEventsTopicName, [
        {
          key: userId,
          value: {
            created_at: "2015-02-23T22:00:00Z",
            event_type: "Identify",
          },
        },
      ]);

      const firstMessage: JSONValue = await k.waitForMessage(
        computedPropertiesTopicName,
        ({ message }) => {
          const strMsg = message.value?.toString("utf8");
          return strMsg ? JSON.parse(strMsg) : null;
        }
      );

      expect(firstMessage).toEqual({
        event_type: "Identify",
        created_at: "2015-02-23 22:00:00",
      });
    });
  });
});
