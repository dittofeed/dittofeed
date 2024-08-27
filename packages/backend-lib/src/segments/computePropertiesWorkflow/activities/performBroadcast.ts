import { getBroadcast } from "../../../broadcasts";
import logger from "../../../logger";
import prisma from "../../../prisma";
import { findAllUserPropertyResources } from "../../../userProperties";
import { computePropertiesIncremental } from "./computeProperties";

export async function performBroadcastIncremental({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}) {
  const [broadcastResources, userProperties] = await Promise.all([
    getBroadcast({
      workspaceId,
      broadcastId,
    }),
    findAllUserPropertyResources({
      workspaceId,
    }),
  ]);

  if (!broadcastResources) {
    logger().error(
      {
        broadcastId,
      },
      "Broadcast not found.",
    );
    return null;
  }

  const { broadcast, segment, journey } = broadcastResources;

  if (broadcast.triggeredAt) {
    logger().info(
      {
        broadcast,
      },
      "broadcast already triggered",
    );
    return null;
  }
  const triggeredAt = new Date();

  await computePropertiesIncremental({
    workspaceId,
    integrations: [],
    segments: [segment],
    journeys: [journey],
    now: triggeredAt.getTime(),
    userProperties,
  });

  await prisma().broadcast.update({
    where: {
      id: broadcast.id,
    },
    data: {
      triggeredAt,
      status: "Triggered",
    },
  });

  return null;
}
