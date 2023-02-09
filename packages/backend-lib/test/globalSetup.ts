import { createClickhouseDb } from "../src/clickhouse";

export default async function globalSetup() {
  await createClickhouseDb();
}
