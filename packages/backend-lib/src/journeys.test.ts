import { randomUUID } from "crypto";

import { submitTrack } from "./apps/track";
import { getJourneysStats } from "./journeys";
import prisma from "./prisma";
import {
  ChannelType,
  InternalEventType,
  JourneyDefinition,
  JourneyNodeType,
  MessageNode,
  NodeStatsType,
  SegmentSplitNode,
  SegmentSplitVariantType,
} from "./types";

describe("journeys", () => {
  describe("getJourneysStats", () => {
    let workspaceId: string;
    let journeyId: string;

    describe("when a journey node has associated message stats", () => {
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

        await submitTrack({
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

    describe("when the journey node has nested segment splits", () => {
      beforeEach(async () => {
        const workspace = await prisma().workspace.create({
          data: {
            name: randomUUID(),
          },
        });
        workspaceId = workspace.id;
        const journeyDefinition: JourneyDefinition = {
          entryNode: {
            type: JourneyNodeType.SegmentEntryNode,
            segment: randomUUID(),
            child: "split-node-1",
          },
          nodes: [
            {
              id: "split-node-1",
              type: JourneyNodeType.SegmentSplitNode,
              variant: {
                type: SegmentSplitVariantType.Boolean,
                segment: randomUUID(),
                trueChild: "message-node-1",
                falseChild: "split-node-2",
              },
            },
            {
              id: "split-node-2",
              type: JourneyNodeType.SegmentSplitNode,
              variant: {
                type: SegmentSplitVariantType.Boolean,
                segment: randomUUID(),
                trueChild: "message-node-1",
                falseChild: "message-node-2",
              },
            },
            {
              id: "message-node-1",
              type: JourneyNodeType.MessageNode,
              child: JourneyNodeType.ExitNode,
              variant: {
                type: ChannelType.Email,
                templateId: randomUUID(),
              },
            },
            {
              id: "message-node-2",
              type: JourneyNodeType.MessageNode,
              child: "message-node-1",
              variant: {
                type: ChannelType.Email,
                templateId: randomUUID(),
              },
            },
          ],
        };
      });
    });
    describe("when the journey node has nested segment splits ending in exit", () => {});
  });
});
