import {
  BucketLocationConstraint,
  CreateBucketCommand,
  CreateBucketCommandInput,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
  S3ServiceException,
} from "@aws-sdk/client-s3";

import config, { AwsCredentialsProvider } from "./config";

let S3_CLIENT: S3Client | null = null;

export function buildS3ClientConfig(): S3ClientConfig {
  const {
    blobStorageAccessKeyId,
    blobStorageSecretAccessKey,
    blobStorageEndpoint,
    blobStorageRegion,
    blobStorageCredentialsProvider,
    blobStorageForcePathStyle,
  } = config();

  const clientConfig: S3ClientConfig = {
    region: blobStorageRegion,
    forcePathStyle: blobStorageForcePathStyle,
  };

  if (blobStorageEndpoint) {
    clientConfig.endpoint = blobStorageEndpoint;
  }

  // When using the AWS default credential provider chain we intentionally do
  // not pass static credentials so that the SDK can resolve short-lived
  // credentials from IRSA / EKS Pod Identity / ECS task roles / EC2 instance
  // profiles, and refresh them automatically.
  if (blobStorageCredentialsProvider === AwsCredentialsProvider.StaticKeys) {
    clientConfig.credentials = {
      accessKeyId: blobStorageAccessKeyId,
      secretAccessKey: blobStorageSecretAccessKey,
    };
  }
  return clientConfig;
}

/**
 * Returns a process-wide S3 client. AWS SDK clients are designed to be
 * long-lived and re-used: they maintain a keep-alive connection pool and cache
 * resolved credentials, so creating a new client per request adds avoidable
 * latency (TLS handshakes, credential resolution) and load on IMDS / STS.
 */
export function storage(): S3Client {
  if (!S3_CLIENT) {
    S3_CLIENT = new S3Client(buildS3ClientConfig());
  }
  return S3_CLIENT;
}

/**
 * Exposed for tests and for long-running processes that need to pick up
 * configuration changes.
 */
export function resetStorageClient() {
  if (S3_CLIENT) {
    S3_CLIENT.destroy();
  }
  S3_CLIENT = null;
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

function getHttpStatusCode(e: unknown): number | undefined {
  if (e instanceof S3ServiceException) {
    return e.$metadata.httpStatusCode;
  }
  return undefined;
}

async function bucketExists(
  client: S3Client,
  bucketName: string,
): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return true;
  } catch (e) {
    const status = getHttpStatusCode(e);
    if (
      status === 404 ||
      (e instanceof Error &&
        (e.name === "NotFound" || e.name === "NoSuchBucket"))
    ) {
      return false;
    }
    // 403: the credentials may not have s3:ListBucket (which HeadBucket
    // requires). Fall through to CreateBucket, which preserves the previous
    // behaviour for existing static-key deployments (BucketAlreadyOwnedByYou
    // is ignored below).
    if (status === 403) {
      return false;
    }
    throw e;
  }
}

export async function createBucket(
  client: S3Client,
  { bucketName }: { bucketName: string },
) {
  // Check for the bucket first. In AWS deployments the bucket is typically
  // provisioned out-of-band (CloudFormation / CDK / Terraform) and the
  // application role should only need s3:ListBucket (for HeadBucket), not
  // s3:CreateBucket.
  if (await bucketExists(client, bucketName)) {
    return;
  }

  const input: CreateBucketCommandInput = {
    Bucket: bucketName,
  };
  // Amazon S3 requires a LocationConstraint for every region other than
  // us-east-1, otherwise CreateBucket fails with
  // IllegalLocationConstraintException.
  const region = config().blobStorageRegion;
  if (region && region !== "us-east-1") {
    const locationConstraint = Object.values(BucketLocationConstraint).find(
      (c) => c === region,
    );
    if (!locationConstraint) {
      throw new Error(
        `Unsupported S3 region for bucket creation: ${region}. Create the bucket out-of-band.`,
      );
    }
    input.CreateBucketConfiguration = {
      LocationConstraint: locationConstraint,
    };
  }

  try {
    await client.send(new CreateBucketCommand(input));
  } catch (e) {
    // Ignore if bucket already exists and is owned by us
    if (e instanceof Error && e.name === "BucketAlreadyOwnedByYou") {
      return;
    }
    throw e;
  }
}

export async function deleteObjectsWithPrefix(
  client: S3Client,
  { prefix }: { prefix: string },
) {
  const bucket = config().blobStorageBucket;
  let continuationToken: string | undefined;
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
  let continuationToken: string | undefined;
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
