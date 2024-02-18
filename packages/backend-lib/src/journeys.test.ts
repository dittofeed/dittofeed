import { randomUUID } from "crypto";

import { submitTrackWithTriggers } from "./apps";
import { getJourneysStats } from "./journeys";
import prisma from "./prisma";
import {
  ChannelType,
  InternalEventType,
  JourneyDefinition,
  JourneyNodeType,
  NodeStatsType,
} from "./types";

describe("journeys", () => {
  describe("getJourneysStats", () => {
    describe("when a journey node has associated message stats", () => {
      let workspaceId: string;
      let journeyId: string;
      let messageNodeId: string;

      beforeEach(async () => {
        const workspace = await prisma().workspace.create({
          data: {
            name: randomUUID(),
          },
        });
        workspaceId = workspace.id;
        messageNodeId = randomUUID();

        const journeyDefinition: JourneyDefinition = {
          entryNode: {
            type: JourneyNodeType.SegmentEntryNode,
            segment: randomUUID(),
            child: messageNodeId,
          },
          exitNode: {
            type: JourneyNodeType.ExitNode,
          },
          nodes: [
            {
              id: messageNodeId,
              type: JourneyNodeType.MessageNode,
              variant: {
                type: ChannelType.Email,
                templateId: randomUUID(),
              },
              child: JourneyNodeType.ExitNode,
            },
          ],
        };
        const journey = await prisma().journey.create({
          data: {
            workspaceId,
            definition: journeyDefinition,
            name: randomUUID(),
          },
        });
        journeyId = journey.id;

        await submitTrackWithTriggers({
          workspaceId,
          data: {
            userId: randomUUID(),
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              from: "from@email.com",
              to: "to@email.com",
              body: "hello",
              subject: "hello",
              nodeId: messageNodeId,
              templateId: randomUUID(),
              journeyId,
              channel: ChannelType.Email,
              runId: randomUUID(),
            },
          },
        });
      });
      it("returns the stats", async () => {
        const stats = await getJourneysStats({
          workspaceId,
          journeyIds: [journeyId],
        });
        expect(stats).toEqual([
          {
            workspaceId,
            journeyId,
            nodeStats: {
              [messageNodeId]: expect.objectContaining({
                type: NodeStatsType.MessageNodeStats,
                sendRate: 1,
                channelStats: expect.objectContaining({
                  type: ChannelType.Email,
                }) as unknown,
              }) as unknown,
            },
          },
        ]);
      });
    });
  });
});
