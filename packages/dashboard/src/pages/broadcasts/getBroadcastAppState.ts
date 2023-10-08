import prisma from "backend-lib/src/prisma";
import { GetServerSidePropsContext } from "next";
import { validate } from "uuid";

import { AppState } from "../../lib/types";
import { SegmentDefinition, SegmentNodeType } from "isomorphic-lib/src/types";

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

  let broadcast = await prisma().broadcast.findUnique({
    where: {
      id,
    },
  });

  if (!broadcast) {
    const segmentDefinition: SegmentDefinition = {
      entryNode: {
        type: SegmentNodeType.Broadcast,
        id: "segment-broadcast-entry",
      },
      nodes: [],
    };

    // TODO create segment and template
    [broadcast] = await Promise.all([
      prisma().broadcast.upsert({
        where: {
          id,
        },
        create: {
          id,
          workspaceId,
          name: `Broadcast - ${id}`,
        },
        update: {},
      }),
    ]);
  }

  if (broadcast.workspaceId !== workspaceId) {
    return null;
  }

  appState.editedBroadcast = {
    id,
    name: broadcast.name,
    workspaceId,
    segmentId: broadcast.segmentId ?? undefined,
    createdAt: broadcast.createdAt.getTime(),
    triggeredAt: broadcast.triggeredAt?.getTime(),
  };

  return appState;
}
