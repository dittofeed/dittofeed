import { randomUUID } from "crypto";
import * as R from "remeda";

import { submitTrack } from "./apps/track";
import { getJourneysStats, recordNodeProcessed } from "./journeys";
import prisma from "./prisma";
import {
  ChannelType,
  InternalEventType,
  JourneyDefinition,
  JourneyNodeType,
  MessageNode,
  NodeStatsType,
  SegmentEntryNode,
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

        const entryNode: SegmentEntryNode = {
          type: JourneyNodeType.SegmentEntryNode,
          segment: randomUUID(),
          child: "split-node-1",
        };

        const splitNode1: SegmentSplitNode = {
          type: JourneyNodeType.SegmentSplitNode,
          id: "split-node-1",
          variant: {
            type: SegmentSplitVariantType.Boolean,
            segment: randomUUID(),
            trueChild: "message-node-1",
            falseChild: "split-node-2",
          },
        };
        const splitNode2: SegmentSplitNode = {
          id: "split-node-2",
          type: JourneyNodeType.SegmentSplitNode,
          variant: {
            type: SegmentSplitVariantType.Boolean,
            segment: randomUUID(),
            trueChild: "message-node-1",
            falseChild: "message-node-2",
          },
        };
        const messageNode1: MessageNode = {
          id: "message-node-1",
          type: JourneyNodeType.MessageNode,
          child: JourneyNodeType.ExitNode,
          variant: {
            type: ChannelType.Email,
            templateId: randomUUID(),
          },
        };
        const messageNode2: MessageNode = {
          id: "message-node-2",
          type: JourneyNodeType.MessageNode,
          child: "message-node-1",
          variant: {
            type: ChannelType.Email,
            templateId: randomUUID(),
          },
        };

        const journeyDefinition: JourneyDefinition = {
          entryNode,
          nodes: [splitNode1, splitNode2, messageNode1, messageNode2],
          exitNode: {
            type: JourneyNodeType.ExitNode,
          },
        };
        const journey = await prisma().journey.create({
          data: {
            workspaceId,
            definition: journeyDefinition,
            name: randomUUID(),
          },
        });
        journeyId = journey.id;

        const journeyStartedAt = Date.now();

        await Promise.all([
          ...R.times(3, (i) =>
            recordNodeProcessed({
              journeyStartedAt,
              journeyId,
              node: entryNode,
              workspaceId,
              userId: `user-${i}`,
            })
          ),
          ...R.times(3, (i) =>
            recordNodeProcessed({
              journeyStartedAt,
              journeyId,
              node: splitNode1,
              workspaceId,
              userId: `user-${i}`,
            })
          ),
          ...R.times(3, (i) =>
            recordNodeProcessed({
              journeyStartedAt,
              journeyId,
              node: messageNode1,
              workspaceId,
              userId: `user-${i}`,
            })
          ),
          ...R.times(2, (i) =>
            recordNodeProcessed({
              journeyStartedAt,
              journeyId,
              node: splitNode1,
              workspaceId,
              userId: `user-${i + 1}`,
            })
          ),
          recordNodeProcessed({
            journeyStartedAt,
            journeyId,
            node: messageNode2,
            workspaceId,
            userId: `user-2`,
          }),
        ]);
      });
    });
    describe("when the journey node has nested segment splits ending in exit", () => {});
  });
});
