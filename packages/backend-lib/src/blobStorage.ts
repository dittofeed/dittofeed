import { S3Client } from "@aws-sdk/client-s3";
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
