import type { Config } from "./config";

const BASE_ENV = {
  NODE_ENV: "production",
  CLICKHOUSE_HOST: "http://clickhouse:8123",
  CLICKHOUSE_USER: "u",
  CLICKHOUSE_PASSWORD: "p",
  DATABASE_URL: "postgresql://u:p@localhost:5432/d",
};

const AWS_KEYS = [
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "BLOB_STORAGE_ENDPOINT",
  "BLOB_STORAGE_REGION",
  "BLOB_STORAGE_CREDENTIALS_PROVIDER",
  "BLOB_STORAGE_FORCE_PATH_STYLE",
  "AMAZON_SES_CREDENTIALS_PROVIDER",
];

function loadConfig(env: Record<string, string>): Config {
  const saved = { ...process.env };
  process.env = Object.fromEntries(
    Object.entries(saved).filter(([k]) => !AWS_KEYS.includes(k)),
  );
  Object.assign(process.env, BASE_ENV, env);
  try {
    let result: Config | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require, @typescript-eslint/no-unsafe-assignment
      const mod: { default: () => Config } = require("./config");
      result = mod.default();
    });
    if (!result) throw new Error("config not loaded");
    return result;
  } finally {
    process.env = saved;
  }
}

describe("AWS config defaults", () => {
  it("legacy deployments (no new env vars) keep previous defaults, ignoring AWS_REGION", () => {
    const c = loadConfig({ AWS_REGION: "eu-west-1" });
    expect(c.blobStorageCredentialsProvider).toBe("static");
    expect(c.amazonSesCredentialsProvider).toBe("static");
    expect(c.blobStorageEndpoint).toBe("http://localhost:9010");
    expect(c.blobStorageForcePathStyle).toBe(true);
    expect(c.blobStorageRegion).toBe("us-east-1");
    expect(c.blobStorageAccessKeyId).toBe("admin");
  });

  it("legacy deployments keep explicitly configured values", () => {
    const c = loadConfig({
      BLOB_STORAGE_ENDPOINT: "https://minio.internal:9000",
      BLOB_STORAGE_REGION: "local",
    });
    expect(c.blobStorageEndpoint).toBe("https://minio.internal:9000");
    expect(c.blobStorageRegion).toBe("local");
    expect(c.blobStorageForcePathStyle).toBe(true);
  });

  it("default credential chain mode targets Amazon S3", () => {
    const c = loadConfig({
      BLOB_STORAGE_CREDENTIALS_PROVIDER: "default",
      AWS_REGION: "us-west-2",
    });
    expect(c.blobStorageEndpoint).toBeUndefined();
    expect(c.blobStorageForcePathStyle).toBe(false);
    expect(c.blobStorageRegion).toBe("us-west-2");
    expect(c.awsDefaultRegion).toBe("us-west-2");
  });

  it("BLOB_STORAGE_FORCE_PATH_STYLE overrides the mode default", () => {
    const c = loadConfig({
      BLOB_STORAGE_CREDENTIALS_PROVIDER: "default",
      BLOB_STORAGE_FORCE_PATH_STYLE: "true",
    });
    expect(c.blobStorageForcePathStyle).toBe(true);
  });
});
