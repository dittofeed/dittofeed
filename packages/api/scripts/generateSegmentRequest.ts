// HOST='https://customer.dittofeed.com' TRAITS='{ "env": "development", "email": "name@email.com" }' SHARED_SECRET=**** yarn workspace api ts-node ./scripts/generateSegmentRequest.ts

import backendConfig from "backend-lib/src/config";
import { generateDigest } from "backend-lib/src/crypto";
import { segmentIdentifyEvent } from "backend-lib/src/segmentIO";

function generateSegmentRequest() {
  const sharedSecret = process.env.SHARED_SECRET;
  if (!sharedSecret) {
    throw new Error("Missing env variable SHARED_SECRET");
  }
  const env = backendConfig().nodeEnv;

  const host = process.env.HOST ?? "localhost:3001";
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const traits = process.env.TRAITS ? JSON.parse(process.env.TRAITS) : {};

  const payload = segmentIdentifyEvent({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    traits: {
      env,
      ...traits,
    },
  });
  const body = JSON.stringify(payload);
  const signature = generateDigest({
    sharedSecret,
    rawBody: body,
  });
  // eslint-disable-next-line no-console
  console.log(
    `curl -X POST -H "x-signature:${signature}" -H "Content-Type: application/json" -d '${body}' '${host}/api/webhooks/segment'`,
  );
}

generateSegmentRequest();
