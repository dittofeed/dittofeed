import prisma from "backend-lib/src/prisma";
import { GetServerSidePropsContext } from "next";
import { validate } from "uuid";

import { AppState } from "../../lib/types";

export async function getBroadcastAppState({
  ctx,
  workspaceId,
}: {
  ctx: GetServerSidePropsContext;
  workspaceId: string;
}): Promise<Partial<AppState> | null> {
  const appState: Partial<AppState> = {};

  const id = ctx.params?.id;

  if (typeof id !== "string" || !validate(id)) {
    return null;
  }

  const broadcast = await prisma().broadcast.findUnique({
    where: {
      id,
    },
  });

  if (
    broadcast &&
    broadcast.workspaceId === workspaceId &&
    broadcast.segmentId
  ) {
    appState.editedBroadcast = {
      workspaceId,
      id,
      name: broadcast.name,
      segmentId: broadcast.segmentId,
      createdAt: broadcast.createdAt.getTime(),
      triggeredAt: broadcast.triggeredAt?.getTime(),
    };
  } else {
    appState.editedBroadcast = {
      workspaceId,
      id,
      name: `Broadcast - ${id}`,
    };
  }
  return appState;
}
