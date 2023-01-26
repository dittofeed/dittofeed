import { clickhouseClient } from "../src/clickhouse";

export default async function globalSetup() {
  await clickhouseClient.exec({
    query: "CREATE DATABASE IF NOT EXISTS dittofeed",
    clickhouse_settings: {
      wait_end_of_query: 1,
    },
  });

  await clickhouseClient.close();
}
