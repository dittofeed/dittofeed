import { putObject, storage } from "../blobStorage";
import config from "../config";
import {
  AppDataFiles,
  AppFileType,
  BlobStorageFile,
  InternalEventType,
  TrackEventProperties,
} from "../types";

interface TrackEventForFiles {
  files: AppDataFiles;
  messageId: string;
  properties: TrackEventProperties;
}

export function eventFileKey({
  messageId,
  name,
}: {
  messageId: string;
  name: string;
}): string {
  return `event-files/${messageId}/${name}`;
}

/**
 * Takes the file data from an event and persists it to the blob storage. Then
 * modifies the event properties to include the file data.
 * @param event
 * @returns
 */
export async function persistFiles(
  event: TrackEventForFiles,
): Promise<TrackEventProperties> {
  const promises: Promise<unknown>[] = [];
  const files: Record<string, Omit<BlobStorageFile, "name">> = {};
  const s = storage();
  if (config().enableBlobStorage) {
    for (const file of event.files) {
      const key = eventFileKey({
        messageId: event.messageId,
        name: file.name,
      });
      promises.push(
        putObject(s, {
          key,
          text: file.data,
          contentType: file.mimeType,
        }),
      );
      files[file.name] = {
        type: AppFileType.BlobStorage,
        key,
        mimeType: file.mimeType,
      };
    }
  }
  await Promise.all(promises);

  const properties: TrackEventProperties = config().enableBlobStorage
    ? {
        ...event.properties,
        [InternalEventType.AttachedFiles]: files,
      }
    : event.properties;

  return properties;
}
