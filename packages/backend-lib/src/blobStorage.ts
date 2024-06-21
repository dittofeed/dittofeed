import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import config from "./config";

export function storage() {
  const { blobStorageAccessKeyId, blobStorageSecretAccessKey } = config();
  const s3Client = new S3Client({
    credentials: {
      accessKeyId: blobStorageAccessKeyId,
      secretAccessKey: blobStorageSecretAccessKey,
    },
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
