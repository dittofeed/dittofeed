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
  logger().info(
    {
      workspaceId,
      broadcastId,
    },
    "performing broadcast"
  );
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

  if (broadcast.triggeredAt) {
    logger().info(
      {
        broadcast,
      },
      "broadcast already triggered"
    );
    return null;
  }
  const triggeredAt = new Date();

  await computePropertiesPeriod({
    workspaceId,
    subscribedJourneys: [journey],
    segmentIds: [segment.id],
    tableVersion: userEventsTable,
    currentTime: triggeredAt.getTime(),
    userProperties: [],
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
