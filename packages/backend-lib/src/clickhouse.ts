import { createClient } from "@clickhouse/client";

export const clickhouseClient = createClient({
  clickhouse_settings: {
    date_time_input_format: "best_effort",
  },
});
