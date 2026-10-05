import fs from "fs";
import path from "path";

const backendLibDir = path.join(__dirname, "..");
const repoRootDir = path.join(backendLibDir, "..", "..");
const systemLogTtlPath = path.join(
  backendLibDir,
  "clickhouse_config.d",
  "system_log_ttl.xml"
);
const configMount =
  "./packages/backend-lib/clickhouse_config.d:/etc/clickhouse-server/config.d";

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRootDir, relativePath), "utf8");
}

describe("clickhouse system log TTLs", () => {
  it("ships TTLs for the noisy system logs so bundled instances stop growing them without bound", () => {
    const xml = fs.readFileSync(systemLogTtlPath, "utf8");
    expect(xml).toContain("<clickhouse>");
    const expectedTtls: Array<[string, string]> = [
      ["text_log", "INTERVAL 3 DAY"],
      ["metric_log", "INTERVAL 3 DAY"],
      ["asynchronous_metric_log", "INTERVAL 3 DAY"],
      ["trace_log", "INTERVAL 3 DAY"],
      ["processors_profile_log", "INTERVAL 3 DAY"],
      ["query_log", "INTERVAL 7 DAY"],
    ];
    for (const [table, interval] of expectedTtls) {
      expect(xml).toMatch(
        new RegExp(`<${table}>[\\s\\S]*?<ttl>event_date \\+ ${interval}</ttl>`),
      );
    }
  });

  it("mounts the config.d snippet into every bundled clickhouse-server service", () => {
    const composeFiles = [
      "docker-compose.lite.yaml",
      "docker-compose.yaml",
      "docker-compose.ee.yaml",
    ];
    for (const composeFile of composeFiles) {
      expect(readRepoFile(composeFile)).toContain(configMount);
    }
  });
});
