import { createClient } from "@clickhouse/client";

import config from "./config";

const {
  clickhouseHost: host,
  clickhouseDatabase: database,
  clickhouseUsername: username,
  clickhousePassword: password,
} = config();

export const clickhouseClient = createClient({
  host,
  database,
  username,
  password,
  clickhouse_settings: {
    date_time_input_format: "best_effort",
  },
});
