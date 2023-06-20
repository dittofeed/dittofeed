// yarn workspace backend-lib ts-node scripts/fcmNotification.ts --to=name@dittofeed.com --from=support@dittofeed.com
import { credential } from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import fs from "fs";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { FcmKey } from "../src/destinations/fcm";
import logger from "../src/logger";

async function fcmNotification() {
  const argv = await yargs(hideBin(process.argv))
    .options({
      deviceToken: { type: "string", demandOption: true },
      title: { type: "string" },
      body: { type: "string" },
      imageUrl: { type: "string" },
      keyPath: { type: "string", demandOption: true },
    })
    .strict()
    .parse();

  const fcmKeyContents = fs.readFileSync(argv.keyPath, "utf8");
  const fcmKeyValue = schemaValidate(JSON.parse(fcmKeyContents), FcmKey);
  if (fcmKeyValue.isErr()) {
    logger().error({ err: fcmKeyValue.error, fcmKeyValue }, "Invalid FCM key");
    throw new Error("Invalid FCM key");
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { project_id, private_key, client_email } = fcmKeyValue.value;

  const app = initializeApp({
    credential: credential.cert({
      projectId: project_id,
      privateKey: private_key,
      clientEmail: client_email,
    }),
  });
  const messaging = getMessaging(app);
  await messaging.send({
    token: argv.deviceToken,
    notification: {
      title: argv.title,
      body: argv.body,
      imageUrl: argv.imageUrl,
    },
    android: {
      notification: {
        channelId: "default",
      },
    },
  });
}

fcmNotification().catch((e) => {
  console.error(e);
  process.exit(1);
});
