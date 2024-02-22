import { submitBatch } from "backend-lib/src/apps/batch";
import prisma from "backend-lib/src/prisma";
import { EventType } from "isomorphic-lib/src/types";
import { v4 as uuid } from "uuid";

async function seedDemo() {
  const now = Date.now();
  const messageId1 = uuid();

  const workspace = await prisma().workspace.findFirstOrThrow();

  await submitBatch({
    workspaceId: workspace.id,
    data: {
      batch: [
        {
          type: EventType.Identify,
          messageId: messageId1,
          anonymousId: uuid(),
          userId: uuid(),
          timestamp: new Date(now - 1000).toISOString(),
          // 5 minutes ago
          traits: {
            createdAt: new Date(now - 300000).toISOString(),
          },
        },
      ],
    },
  });
}

seedDemo().catch((e) => {
  console.error(e);
  process.exit(1);
});
