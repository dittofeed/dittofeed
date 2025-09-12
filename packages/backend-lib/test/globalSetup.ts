import { createBucket, storage } from "../src/blobStorage";
import { bootstrapClickhouse } from "../src/bootstrap";
import config from "../src/config";
import { drizzleMigrate } from "../src/migrate";

export default async function globalSetup() {
  const tasks = [bootstrapClickhouse(), drizzleMigrate()];
  if (config().enableBlobStorage) {
    const s3 = storage();
    tasks.push(
      (async () => {
        try {
          await createBucket(s3, { bucketName: config().blobStorageBucket });
        } catch (e) {
          const err = e as { name?: string; Code?: string };
          const code = err.name ?? err.Code;
          if (
            code !== "BucketAlreadyOwnedByYou" &&
            code !== "BucketAlreadyExists"
          ) {
            throw e;
          }
        }
      })(),
    );
  }
  await Promise.all(tasks);
}
