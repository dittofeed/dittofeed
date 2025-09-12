/* eslint-disable no-await-in-loop */
import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Client } from "pg";
import { PostgresError } from "pg-error-enum";

import { storage } from "../src/blobStorage";
import { clickhouseClient } from "../src/clickhouse";
import config from "../src/config";
import logger from "../src/logger";

async function dropClickhouse() {
  await clickhouseClient().exec({
    query: `DROP DATABASE IF EXISTS ${config().clickhouseDatabase} SYNC`,
    clickhouse_settings: {
      wait_end_of_query: 1,
    },
  });
  await clickhouseClient().close();
}

async function dropPostgres() {
  const { databaseUser, databasePassword, databaseHost, databasePort } =
    config();
  const client = new Client({
    user: databaseUser,
    password: databasePassword,
    host: databaseHost,
    database: "postgres",
    port: parseInt(databasePort ?? "5432", 10),
  });
  const { database } = config();
  try {
    await client.connect();
    await client.query(`
      DROP DATABASE ${database}
    `);
  } catch (e) {
    const error = e as Error;
    if (
      "code" in error &&
      typeof error.code === "string" &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      error.code === PostgresError.UNDEFINED_DATABASE
    ) {
      logger().info({ database }, "Database does not exist");
    } else {
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function dropBucket() {
  if (!config().enableBlobStorage) {
    return;
  }
  const s3 = storage();
  const bucket = config().blobStorageBucket;

  // Try direct delete first; if not empty, fall back to emptying.
  try {
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
    return;
  } catch (e) {
    const err = e as { name?: string; Code?: string };
    const code = err.name ?? err.Code;
    if (code === "NoSuchBucket" || code === "NotFound") {
      return;
    }
    if (code !== "BucketNotEmpty") {
      throw e;
    }
  }

  // Empty the bucket, then delete it.
  let continuationToken: string | undefined;
  do {
    const listResp = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );
    const objects = (listResp.Contents ?? [])
      .filter((o) => !!o.Key)
      .map((o) => ({ Key: o.Key! }));
    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects, Quiet: true },
        }),
      );
    }
    continuationToken = listResp.IsTruncated
      ? listResp.NextContinuationToken
      : undefined;
  } while (continuationToken);

  await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
}

export default async function globalTeardown() {
  await Promise.all([dropClickhouse(), dropPostgres(), dropBucket()]);
}
