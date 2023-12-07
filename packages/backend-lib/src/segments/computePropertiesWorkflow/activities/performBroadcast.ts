import { getBroadcast } from "../../../broadcasts";
import logger from "../../../logger";
import prisma from "../../../prisma";
import {
  computePropertiesIncremental,
  computePropertiesPeriod,
} from "./computeProperties";

export async function performBroadcastIncremental({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}) {
  const broadcastResources = await getBroadcast({
    workspaceId,
    broadcastId,
  });

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

  await computePropertiesIncremental({
    workspaceId,
    integrations: [],
    segments: [segment],
    journeys: [journey],
    now: triggeredAt.getTime(),
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
  const broadcastResources = await getBroadcast({
    workspaceId,
    broadcastId,
  });

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
