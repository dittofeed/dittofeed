import { bootstrapClickhouse } from "../src/bootstrap";
import config from "../src/config";
import { createBucket, storage } from "../src/blobStorage";
import { drizzleMigrate } from "../src/migrate";

export default async function globalSetup() {
  const tasks = [bootstrapClickhouse(), drizzleMigrate()];
  if (config().enableBlobStorage) {
    tasks.push(
      createBucket(storage(), { bucketName: config().blobStorageBucket }),
    );
  }
  await Promise.all(tasks);
}
