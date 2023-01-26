/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/require-await */
/**
 * This file is used to test our segment webhook. Need to disable
 * typescript-eslint rules because segment's node library doesn't have well
 * maintained types.
 *
 * https://github.com/segmentio/analytics-node/issues/283#issuecomment-1281687160
 */
import Analytics from "analytics-node";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function segmentTest() {
  if (!process.env.SEGMENT_WEBHOOK_WRITE_KEY) {
    throw new Error("Missing segment webhook write key");
  }
  const analytics = new Analytics(process.env.SEGMENT_WEBHOOK_WRITE_KEY);
  analytics.identify({
    userId: "f4ca124298",
    traits: {
      name: "Michael Bolton",
      email: "mbolton@example.com",
      createdAt: new Date("2014-06-14T02:00:19.467Z"),
    },
  });
  analytics.page({
    userId: "019mr8mf4r",
    category: "Docs",
    name: "Node.js Library",
    properties: {
      url: "https://segment.com/docs/connections/sources/catalog/librariesnode",
      path: "/docs/connections/sources/catalog/librariesnode/",
      title: "Node.js Library - Segment",
      referrer: "https://github.com/segmentio/analytics-node",
    },
  });
  await analytics.flush();
}

segmentTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
