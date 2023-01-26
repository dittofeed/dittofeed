import { clickhouseClient } from "../src/clickhouse";

export default async function globalTeardown() {
  await clickhouseClient.exec({
    query: "DROP DATABASE IF EXISTS dittofeed SYNC",
    clickhouse_settings: {
      wait_end_of_query: 1,
    },
  });
  await clickhouseClient.close();
}
