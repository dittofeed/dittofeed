import { randomUUID } from "crypto";

import { submitBatch } from "./apps";
import config from "./config";
import { searchDeliveries } from "./deliveries";
import prisma from "./prisma";
import {
  BatchItem,
  ChannelType,
  EmailProviderType,
  EventType,
  InternalEventType,
} from "./types";

describe("deliveries", () => {
  describe("searchDeliveries", () => {
    let workspaceId: string;

    beforeEach(async () => {
      const workspace = await prisma().workspace.create({
        data: {
          name: randomUUID(),
        },
      });
      workspaceId = workspace.id;

      await prisma().currentUserEventsTable.create({
        data: {
          workspaceId,
          version: config().defaultUserEventsTableVersion,
        },
      });

      const userId = randomUUID();
      const now = new Date();

      function generateEvent({
        offset,
        event,
        properties,
      }: {
        offset: number;
        event: string;
        properties: Record<string, unknown>;
      }): BatchItem {
        return {
          userId,
          timestamp: new Date(now.getTime() + offset).toISOString(),
          type: EventType.Track,
          messageId: randomUUID(),
          event,
          properties: {
            ...properties,
          },
        };
      }

      const journeyId = randomUUID();
      const nodeId1 = randomUUID();
      const nodeId2 = randomUUID();
      const runId = randomUUID();
      const templateId1 = randomUUID();
      const templateId2 = randomUUID();
      const messageId1 = randomUUID();
      const messageId2 = randomUUID();

      const node1Properties = {
        workspaceId,
        journeyId,
        nodeId: nodeId1,
        runId,
        templateId: templateId1,
        channel: ChannelType.Email,
        messageId: messageId1,
      };

      const node2Properties = {
        workspaceId,
        journeyId,
        nodeId: nodeId2,
        runId,
        templateId: templateId2,
        channel: ChannelType.Email,
        messageId: messageId2,
      };

      // Submit email events
      const events: BatchItem[] = [
        generateEvent({
          offset: 0,
          event: InternalEventType.MessageSent,
          properties: {
            ...node1Properties,
            provider: EmailProviderType.Sendgrid,
            from: "test-from@email.com",
            to: "test-to@email.com",
            body: "body1",
            subject: "subject1",
          },
        }),
        generateEvent({
          offset: 10,
          event: InternalEventType.EmailDelivered,
          properties: node1Properties,
        }),
        generateEvent({
          offset: 20,
          event: InternalEventType.EmailOpened,
          properties: node1Properties,
        }),
        generateEvent({
          offset: 0,
          event: InternalEventType.MessageSent,
          properties: {
            ...node2Properties,
            provider: EmailProviderType.Sendgrid,
            from: "test-from@email.com",
            to: "test-to@email.com",
            body: "body2",
            subject: "subject2",
          },
        }),
        generateEvent({
          offset: 10,
          event: InternalEventType.EmailBounced,
          properties: node2Properties,
        }),
      ];

      await submitBatch({
        workspaceId,
        data: {
          batch: events,
        },
      });
    });

    it("returns the correct email events", async () => {
      const deliveries = await searchDeliveries({ workspaceId });
      console.log("deliveries", deliveries);
      expect(deliveries.items).toHaveLength(2);
    });
  });
});
