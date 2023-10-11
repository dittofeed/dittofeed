import { getBroadcast } from "../../../broadcasts";
import logger from "../../../logger";
import prisma from "../../../prisma";
import { getCurrentUserEventsTable } from "../../../userEvents";
import { computePropertiesPeriod } from "./computeProperties";

export async function performBroadcast({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}) {
  const [broadcastResources, userEventsTable] = await Promise.all([
    getBroadcast({
      workspaceId,
      broadcastId,
    }),
    getCurrentUserEventsTable({
      workspaceId,
    }),
  ]);

  if (!broadcastResources) {
    logger().error(
      {
        broadcastId,
      },
      "Broadcast not found."
    );
    return null;
  }
  const { broadcast, segment, journey } = broadcastResources;
  logger().info(
    {
      broadcast,
    },
    "performing broadcast"
  );
  const triggereAt = new Date();

  await computePropertiesPeriod({
    workspaceId,
    subscribedJourneys: [journey],
    segmentIds: [segment.id],
    tableVersion: userEventsTable,
    currentTime: triggereAt.getTime(),
    userProperties: [],
  });

  await prisma().broadcast.update({
    where: {
      id: broadcast.id,
    },
    data: {
      triggeredAt: triggereAt,
    },
  });

  return null;
}
