import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

import config from "./config";

export function storage() {
  const {
    blobStorageAccessKeyId,
    blobStorageSecretAccessKey,
    blobStorageEndpoint,
    blobStorageRegion,
  } = config();
  const s3Client = new S3Client({
    credentials: {
      accessKeyId: blobStorageAccessKeyId,
      secretAccessKey: blobStorageSecretAccessKey,
    },
    endpoint: blobStorageEndpoint,
    region: blobStorageRegion,
    forcePathStyle: true,
  });
  return s3Client;
}

export async function putObject(
  client: S3Client,
  {
    text,
    key,
    contentType,
  }: {
    text: string;
    key: string;
    contentType?: string;
  },
) {
  const body = new TextEncoder().encode(text);
  const command = new PutObjectCommand({
    Bucket: config().blobStorageBucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await client.send(command);
}

export async function getObject(
  client: S3Client,
  { key }: { key: string },
): Promise<{
  text: string;
} | null> {
  const command = new GetObjectCommand({
    Bucket: config().blobStorageBucket,
    Key: key,
  });
  const response = await client.send(command);
  if (!response.Body) {
    return null;
  }

  const text = await response.Body.transformToString();
  return { text };
}

export async function createBucket(
  client: S3Client,
  { bucketName }: { bucketName: string },
) {
  const command = new CreateBucketCommand({
    Bucket: bucketName,
  });
  await client.send(command);
}

export async function deleteObjectsWithPrefix(
  client: S3Client,
  { prefix }: { prefix: string },
) {
  const bucket = config().blobStorageBucket;
  let continuationToken: string | undefined = undefined;
  do {
    const listRes: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    const contents = (listRes.Contents ?? []) as { Key?: string }[];
    const keys = contents
      .map((o: { Key?: string }) => o.Key)
      .filter((k: string | undefined): k is string => !!k);
    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.map((Key: string) => ({ Key })),
            Quiet: true,
          },
        }),
      );
    }
    continuationToken = listRes.IsTruncated
      ? listRes.NextContinuationToken
      : undefined;
  } while (continuationToken);
}

export async function listObjectKeysWithPrefix(
  client: S3Client,
  { prefix }: { prefix: string },
): Promise<string[]> {
  const bucket = config().blobStorageBucket;
  const keys: string[] = [];
  let continuationToken: string | undefined = undefined;
  do {
    const listRes: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    const contents = (listRes.Contents ?? []) as { Key?: string }[];
    for (const o of contents) {
      if (o.Key) keys.push(o.Key);
    }
    continuationToken = listRes.IsTruncated
      ? listRes.NextContinuationToken
      : undefined;
  } while (continuationToken);
  return keys;
}
