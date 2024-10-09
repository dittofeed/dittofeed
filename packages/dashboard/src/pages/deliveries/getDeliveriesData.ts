import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { toJourneyResource } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { CompletionStatus } from "isomorphic-lib/src/types";

import prisma from "../../lib/prisma";
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
    prisma().broadcast.findMany({
      where: {
        workspaceId,
      },
    }),
    prisma().journey.findMany({
      where: {
        workspaceId,
      },
    }),
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
