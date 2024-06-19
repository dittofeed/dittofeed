import { PutObjectCommand } from "@aws-sdk/client-s3";
import { storage } from "../blobStorage";
import { AppDataFiles, TrackEventProperties } from "../types";
import config from "../config";

interface TrackEventForFiles {
  files: AppDataFiles;
  messageId: string;
  properties: TrackEventProperties;
}

export async function persistFile(
  event: TrackEventForFiles,
): Promise<TrackEventProperties[]> {
  const promises = event.files.map((file) => {
    const body = new TextEncoder().encode(file.data);
    const uploadFiles = storage().send(
      new PutObjectCommand({
        Bucket: config().blobStorageBucket,
        Key: `event-files/${event.messageId}/${file.name}]}`,
        Body: body,
      }),
    );
  });
  await Promise.all(promises);
  return [];
}
