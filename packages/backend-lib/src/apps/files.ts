import { putObject, storage } from "../blobStorage";
import {
  AppDataFiles,
  AppFileType,
  BlobStorageFile,
  InternalEventType,
  TrackEventProperties,
} from "../types";
import config from "../config";
import logger from "../logger";

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
  let promises: Promise<unknown>[] = [];
  let files: { [name: string]: BlobStorageFile } = {};
  const s = storage();
  if (config().enableBlobStorage) {
    logger().info(event.files, "persisted file loc4");
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
      logger().info({ key, mimeType: file.mimeType }, "persisted file loc3");
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

  logger().debug({ properties }, "persisted files loc3");
  return properties;
}
