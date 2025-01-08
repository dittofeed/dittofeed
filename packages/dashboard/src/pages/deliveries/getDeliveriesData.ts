import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { toJourneyResource } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { eq } from "drizzle-orm";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { AppState } from "../../lib/types";

type DeliveriesData = Pick<AppState, "messages" | "broadcasts" | "journeys">;

export async function getDeliveriesData({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<DeliveriesData> {
  const [messageTemplates, broadcasts, journeys] = await Promise.all([
    findMessageTemplates({
      workspaceId,
    }),
    db()
      .select()
      .from(schema.broadcast)
      .where(eq(schema.broadcast.workspaceId, workspaceId)),
    db()
      .select()
      .from(schema.journey)
      .where(eq(schema.journey.workspaceId, workspaceId)),
  ]);

  return {
    messages: {
      type: CompletionStatus.Successful,
      value: messageTemplates,
    },
    broadcasts: broadcasts.map(toBroadcastResource),
    journeys: {
      type: CompletionStatus.Successful,
      value: journeys.flatMap((j) => toJourneyResource(j).unwrapOr([])),
    },
  };
}
