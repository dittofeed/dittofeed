import { PutObjectCommand } from "@aws-sdk/client-s3";
import { storage } from "../blobStorage";
import {
  AppDataFiles,
  AppFileType,
  BlobStorageFile,
  InternalEventType,
  TrackEventProperties,
} from "../types";
import config from "../config";

interface TrackEventForFiles {
  files: AppDataFiles;
  messageId: string;
  properties: TrackEventProperties;
}

export async function persistFile(
  event: TrackEventForFiles,
): Promise<TrackEventProperties> {
  let promises: Promise<unknown>[] = [];
  let files: { [name: string]: BlobStorageFile } = {};
  for (const file of event.files) {
    const body = new TextEncoder().encode(file.data);
    const key = `event-files/${event.messageId}/${file.name}]}`;
    const uploadFiles = storage().send(
      new PutObjectCommand({
        Bucket: config().blobStorageBucket,
        Key: key,
        Body: body,
      }),
    );
    promises.push(uploadFiles);
    files[file.name] = {
      type: AppFileType.BlobStorage,
      key,
    };
  }
  await Promise.all(promises);

  const properties: TrackEventProperties = {
    ...event.properties,
    [InternalEventType.AttachedFiles]: files,
  };
  return properties;
}
