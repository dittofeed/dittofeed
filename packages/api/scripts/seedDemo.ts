import { submitBatch } from "backend-lib/src/apps/batch";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { eq } from "drizzle-orm";
import { EventType } from "isomorphic-lib/src/types";
import { v4 as uuid } from "uuid";

async function seedDemo() {
  const now = Date.now();
  const messageId1 = uuid();

  const workspace = await db().query.workspace.findFirst({
    where: eq(schema.workspace.id, "123"),
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

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
