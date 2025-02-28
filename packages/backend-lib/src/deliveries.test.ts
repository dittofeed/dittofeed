import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { times } from "remeda";

import { submitBatch } from "./apps/batch";
import {
  getDeliveryBody,
  parseSearchDeliveryRow,
  searchDeliveries,
  SearchDeliveryRow,
} from "./deliveries";
import {
  BatchItem,
  ChannelType,
  EmailProviderType,
  EventType,
  InternalEventType,
  MessageSendSuccess,
  MessageSendSuccessVariant,
  SmsProviderType,
} from "./types";
import { createWorkspace } from "./workspaces";

describe("deliveries", () => {
  let workspaceId: string;

  beforeEach(async () => {
    const workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `test-workspace-${randomUUID()}`,
        updatedAt: new Date(),
      }),
    );
    workspaceId = workspace.id;
  });
  describe("searchDeliveries", () => {
    describe("when the original sent message includes a triggeringMessageId", () => {
      let triggeringMessageId: string;
      beforeEach(async () => {
        const messageSentEvent: Omit<MessageSendSuccess, "type"> = {
          variant: {
            type: ChannelType.Email,
            from: "test-from@email.com",
            to: "test-to@email.com",
            body: "body",
            subject: "subject",
            provider: {
              type: EmailProviderType.Sendgrid,
            },
          },
        };
        triggeringMessageId = randomUUID();

        const events: BatchItem[] = [
          {
            userId: randomUUID(),
            timestamp: new Date(Date.now() - 2000).toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              triggeringMessageId,
              ...messageSentEvent,
            },
          },
        ];
        await submitBatch({
          workspaceId,
          data: {
            batch: events,
          },
        });
      });

      it("returns the correct triggeringMessageId", async () => {
        const deliveries = await searchDeliveries({ workspaceId });
        expect(deliveries.items).toHaveLength(1);
        expect(deliveries.items[0]?.triggeringMessageId).toEqual(
          triggeringMessageId,
        );
      });
    });

    describe("with two different messages from the same journey", () => {
      beforeEach(async () => {
        const userId = randomUUID();
        const now = new Date();

        function generateEvent({
          offset,
          event,
          properties,
          messageId,
        }: {
          offset: number;
          event: string;
          properties: Record<string, unknown>;
          messageId?: string;
        }): BatchItem {
          return {
            userId,
            timestamp: new Date(now.getTime() + offset).toISOString(),
            type: EventType.Track,
            messageId: messageId ?? randomUUID(),
            event,
            properties: {
              ...properties,
            },
          };
        }

        const journeyId = randomUUID();
        const nodeId1 = randomUUID();
        const nodeId2 = randomUUID();
        const nodeId3 = randomUUID();
        const runId = randomUUID();
        const templateId1 = randomUUID();
        const templateId2 = randomUUID();
        const templateId3 = randomUUID();
        const messageId1 = randomUUID();
        const messageId2 = randomUUID();
        const messageId3 = randomUUID();

        const node1Properties = {
          workspaceId,
          journeyId,
          nodeId: nodeId1,
          runId,
          templateId: templateId1,
          messageId: messageId1,
        };

        const node2Properties = {
          workspaceId,
          journeyId,
          nodeId: nodeId2,
          runId,
          templateId: templateId2,
          messageId: messageId2,
        };

        const node3Properties = {
          workspaceId,
          journeyId,
          nodeId: nodeId3,
          runId,
          templateId: templateId3,
          messageId: messageId3,
        };

        const messageSentEvent1: Omit<MessageSendSuccess, "type"> = {
          variant: {
            type: ChannelType.Email,
            from: "test-from@email.com",
            to: "test-to@email.com",
            body: "body1",
            subject: "subject1",
            provider: {
              type: EmailProviderType.Sendgrid,
            },
          },
        };

        const messageSentEvent2: Omit<MessageSendSuccess, "type"> = {
          variant: {
            type: ChannelType.Email,
            from: "test-from@email.com",
            to: "test-to@email.com",
            body: "body2",
            subject: "subject2",
            provider: {
              type: EmailProviderType.Sendgrid,
            },
          },
        };

        // past format form backwards compatibility
        const messageSentEvent3 = {
          channel: ChannelType.Email,
          from: "test-from@email.com",
          to: "test-to@email.com",
          body: "body2",
          subject: "subject2",
        };

        // Submit email events
        const events: BatchItem[] = [
          generateEvent({
            offset: 0,
            event: InternalEventType.MessageSent,
            messageId: messageId1,
            properties: {
              ...node1Properties,
              ...messageSentEvent1,
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
            offset: 10,
            event: InternalEventType.MessageSent,
            messageId: messageId2,
            properties: {
              ...node2Properties,
              ...messageSentEvent2,
            },
          }),
          generateEvent({
            offset: 20,
            event: InternalEventType.EmailBounced,
            properties: node2Properties,
          }),
          // check that backwards compatible
          generateEvent({
            offset: 40,
            event: InternalEventType.MessageSent,
            messageId: messageId3,
            properties: {
              ...node3Properties,
              ...messageSentEvent3,
            },
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
        expect(deliveries.items).toHaveLength(3);
        expect(deliveries.items.map((d) => d.status)).toEqual([
          InternalEventType.MessageSent,
          InternalEventType.EmailBounced,
          InternalEventType.EmailOpened,
        ]);
      });
    });

    describe("when searching by status", () => {
      beforeEach(async () => {
        const userId = randomUUID();
        const now = new Date();

        function generateEvent({
          offset,
          event,
          properties,
          messageId,
        }: {
          offset: number;
          event: string;
          properties: Record<string, unknown>;
          messageId?: string;
        }): BatchItem {
          return {
            userId,
            timestamp: new Date(now.getTime() + offset).toISOString(),
            type: EventType.Track,
            messageId: messageId ?? randomUUID(),
            event,
            properties: {
              ...properties,
            },
          };
        }

        const journeyId = randomUUID();
        const nodeId1 = randomUUID();
        const nodeId2 = randomUUID();
        const nodeId3 = randomUUID();
        const runId = randomUUID();
        const templateId1 = randomUUID();
        const templateId2 = randomUUID();
        const templateId3 = randomUUID();
        const messageId1 = randomUUID();
        const messageId2 = randomUUID();
        const messageId3 = randomUUID();

        const node1Properties = {
          workspaceId,
          journeyId,
          nodeId: nodeId1,
          runId,
          templateId: templateId1,
          messageId: messageId1,
        };

        const node2Properties = {
          workspaceId,
          journeyId,
          nodeId: nodeId2,
          runId,
          templateId: templateId2,
          messageId: messageId2,
        };

        const node3Properties = {
          workspaceId,
          journeyId,
          nodeId: nodeId3,
          runId,
          templateId: templateId3,
          messageId: messageId3,
        };

        const messageSentEvent1: Omit<MessageSendSuccess, "type"> = {
          variant: {
            type: ChannelType.Email,
            from: "test-from@email.com",
            to: "test-to@email.com",
            body: "body1",
            subject: "subject1",
            provider: {
              type: EmailProviderType.Sendgrid,
            },
          },
        };

        const messageSentEvent2: Omit<MessageSendSuccess, "type"> = {
          variant: {
            type: ChannelType.Email,
            from: "test-from@email.com",
            to: "test-to@email.com",
            body: "body2",
            subject: "subject2",
            provider: {
              type: EmailProviderType.Sendgrid,
            },
          },
        };

        // past format form backwards compatibility
        const messageSentEvent3 = {
          channel: ChannelType.Email,
          from: "test-from@email.com",
          to: "test-to@email.com",
          body: "body2",
          subject: "subject2",
        };

        // Submit email events
        const events: BatchItem[] = [
          generateEvent({
            offset: 0,
            event: InternalEventType.MessageSent,
            messageId: messageId1,
            properties: {
              ...node1Properties,
              ...messageSentEvent1,
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
            offset: 10,
            event: InternalEventType.MessageSent,
            messageId: messageId2,
            properties: {
              ...node2Properties,
              ...messageSentEvent2,
            },
          }),
          generateEvent({
            offset: 20,
            event: InternalEventType.EmailBounced,
            properties: node2Properties,
          }),
          // check that backwards compatible
          generateEvent({
            offset: 40,
            event: InternalEventType.MessageSent,
            messageId: messageId3,
            properties: {
              ...node3Properties,
              ...messageSentEvent3,
            },
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
        const deliveries = await searchDeliveries({
          workspaceId,
          statuses: [
            InternalEventType.MessageSent,
            InternalEventType.EmailBounced,
          ],
        });
        expect(deliveries.items).toHaveLength(2);
        expect(deliveries.items.map((d) => d.status)).toEqual([
          InternalEventType.MessageSent,
          InternalEventType.EmailBounced,
        ]);
      });
    });

    describe("when filtering by user id", () => {
      let userId: string;
      beforeEach(async () => {
        userId = randomUUID();

        const messageSentEvent: Omit<MessageSendSuccess, "type"> = {
          variant: {
            type: ChannelType.Email,
            from: "test-from@email.com",
            to: "test-to@email.com",
            body: "body",
            subject: "subject",
            provider: {
              type: EmailProviderType.Sendgrid,
            },
          },
        };
        const events: BatchItem[] = [
          {
            userId,
            timestamp: new Date().toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          },
          {
            userId: randomUUID(),
            timestamp: new Date().toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          },
        ];

        await submitBatch({
          workspaceId,
          data: {
            batch: events,
          },
        });
      });
      it("returns the correct number of items", async () => {
        const deliveries = await searchDeliveries({
          workspaceId,
          userId,
          limit: 10,
        });
        expect(deliveries.items).toHaveLength(1);
        expect(deliveries.items[0]?.userId).toEqual(userId);
      });
    });

    describe("when filtering by multiple user ids", () => {
      let userId1: string;
      let userId2: string;
      let userId: string[];
      beforeEach(async () => {
        userId1 = randomUUID();
        userId2 = randomUUID();
        userId = [userId1, userId2];

        const messageSentEvent: Omit<MessageSendSuccess, "type"> = {
          variant: {
            type: ChannelType.Email,
            from: "test-from@email.com",
            to: "test-to@email.com",
            body: "body",
            subject: "subject",
            provider: {
              type: EmailProviderType.Sendgrid,
            },
          },
        };
        const events: BatchItem[] = [
          {
            userId: userId1,
            timestamp: new Date().toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          },
          {
            userId: userId2,
            timestamp: new Date(Date.now() - 1000).toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          },

          {
            userId: randomUUID(),
            timestamp: new Date(Date.now() - 2000).toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          },
        ];

        await submitBatch({
          workspaceId,
          data: {
            batch: events,
          },
        });
      });
      it("returns the correct number of items", async () => {
        const deliveries = await searchDeliveries({
          workspaceId,
          userId,
          limit: 10,
        });
        expect(deliveries.items).toHaveLength(2);
        expect(deliveries.items[0]?.userId).toEqual(userId1);
        expect(deliveries.items[1]?.userId).toEqual(userId2);
      });
    });

    describe("when filtering by journey id", () => {
      let journeyId: string;
      beforeEach(async () => {
        journeyId = randomUUID();

        const messageSentEvent: Omit<MessageSendSuccess, "type"> = {
          variant: {
            type: ChannelType.Email,
            from: "test-from@email.com",
            to: "test-to@email.com",
            body: "body",
            subject: "subject",
            provider: {
              type: EmailProviderType.Sendgrid,
            },
          },
        };
        const events: BatchItem[] = [
          {
            userId: randomUUID(),
            timestamp: new Date().toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId,
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          },
          {
            userId: randomUUID(),
            timestamp: new Date().toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          },
        ];

        await submitBatch({
          workspaceId,
          data: {
            batch: events,
          },
        });
      });
      it("returns the correct number of items", async () => {
        const deliveries = await searchDeliveries({
          workspaceId,
          journeyId,
          limit: 10,
        });
        expect(deliveries.items).toHaveLength(1);
        expect(deliveries.items[0]?.journeyId).toEqual(journeyId);
      });
    });

    describe("when filtering by group id", () => {
      let groupId1: string;
      let groupId2: string;
      let userId1: string;
      let userId2: string;
      let userId3: string;
      beforeEach(async () => {
        groupId1 = "group-1";
        groupId2 = "group-2";
        userId1 = "user-1";
        userId2 = "user-2";
        userId3 = "user-3";

        const messageSentEvent: Omit<MessageSendSuccess, "type"> = {
          variant: {
            type: ChannelType.Email,
            from: "test-from@email.com",
            to: "test-to@email.com",
            body: "body",
            subject: "subject",
            provider: {
              type: EmailProviderType.Sendgrid,
            },
          },
        };

        const events: BatchItem[] = [
          // message sent events for users
          {
            userId: userId1,
            timestamp: new Date().toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          },
          {
            userId: userId2,
            timestamp: new Date().toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          },
          {
            userId: userId3,
            timestamp: new Date().toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          },
          // group assignments
          {
            userId: userId1,
            timestamp: new Date().toISOString(),
            type: EventType.Group,
            messageId: randomUUID(),
            groupId: groupId1,
          },
          {
            userId: userId2,
            timestamp: new Date().toISOString(),
            type: EventType.Group,
            messageId: randomUUID(),
            groupId: groupId2,
          },
        ];

        await submitBatch({
          workspaceId,
          data: {
            batch: events,
          },
        });
      });

      it("only shows users in the group", async () => {
        const deliveries = await searchDeliveries({
          workspaceId,
          groupId: [groupId1, groupId2],
          limit: 10,
        });
        expect(deliveries.items).toHaveLength(2);
        expect(deliveries.items.map((d) => d.userId)).toContain(userId1);
        expect(deliveries.items.map((d) => d.userId)).toContain(userId2);
        expect(deliveries.items.map((d) => d.userId)).not.toContain(userId3);
      });
    });

    describe("when filtering by channel", () => {
      let channel: ChannelType;
      beforeEach(async () => {
        channel = ChannelType.Email;

        const messageSentEvents: Omit<MessageSendSuccess, "type">[] = [
          {
            variant: {
              type: ChannelType.Email,
              from: "test-from@email.com",
              to: "test-to@email.com",
              body: "body",
              subject: "subject",
              provider: {
                type: EmailProviderType.Sendgrid,
              },
            },
          },
          {
            variant: {
              type: ChannelType.Sms,
              to: "+1234567890",
              body: "body",
              provider: {
                type: SmsProviderType.Twilio,
                sid: randomUUID(),
              },
            },
          },
        ];
        const events: BatchItem[] = messageSentEvents.map(
          (messageSentEvent) => ({
            userId: randomUUID(),
            timestamp: new Date().toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          }),
        );
        await submitBatch({
          workspaceId,
          data: {
            batch: events,
          },
        });
      });
      it("returns the correct number of items", async () => {
        const deliveries = await searchDeliveries({
          workspaceId,
          channels: [channel],
          limit: 10,
        });
        expect(deliveries.items).toHaveLength(1);
        expect(deliveries.items[0]).toEqual(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            variant: expect.objectContaining({
              type: channel,
            }),
          }),
        );
      });
    });

    describe("when filtering by template id", () => {
      let templateId: string;
      beforeEach(async () => {
        templateId = randomUUID();

        const messageSentEvents: (Omit<MessageSendSuccess, "type"> & {
          templateId: string;
        })[] = [
          {
            templateId,
            variant: {
              type: ChannelType.Email,
              from: "test-from@email.com",
              to: "test-to@email.com",
              body: "body",
              subject: "subject",
              provider: {
                type: EmailProviderType.Sendgrid,
              },
            },
          },
          {
            templateId: "invalid-template-id",
            variant: {
              type: ChannelType.Sms,
              to: "+1234567890",
              body: "body",
              provider: {
                type: SmsProviderType.Twilio,
                sid: randomUUID(),
              },
            },
          },
        ];
        const events: BatchItem[] = messageSentEvents.map(
          (messageSentEvent) => ({
            userId: randomUUID(),
            timestamp: new Date().toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          }),
        );
        await submitBatch({
          workspaceId,
          data: {
            batch: events,
          },
        });
      });
      it("returns the correct number of items", async () => {
        const deliveries = await searchDeliveries({
          workspaceId,
          templateIds: [templateId],
          limit: 10,
        });
        expect(deliveries.items).toHaveLength(1);
        expect(deliveries.items[0]).toEqual(
          expect.objectContaining({
            templateId,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            variant: expect.objectContaining({
              type: ChannelType.Email,
            }),
          }),
        );
      });
    });

    describe("when filtering by to", () => {
      let to1: string;
      let to2: string;

      beforeEach(async () => {
        to1 = `test-to-${randomUUID()}@email.com`;
        to2 = "+1234567890";

        const messageSentEvents: Omit<MessageSendSuccess, "type">[] = [
          {
            variant: {
              type: ChannelType.Email,
              from: "test-from@email.com",
              to: to1,
              body: "body",
              subject: "subject",
              provider: {
                type: EmailProviderType.Sendgrid,
              },
            },
          },
          {
            variant: {
              type: ChannelType.Sms,
              to: to2,
              body: "body",
              provider: {
                type: SmsProviderType.Twilio,
                sid: randomUUID(),
              },
            },
          },
          {
            variant: {
              type: ChannelType.Email,
              from: "test-from@email.com",
              to: "bad-to@email.com",
              body: "body",
              subject: "subject",
              provider: {
                type: EmailProviderType.Sendgrid,
              },
            },
          },
        ];
        const events: BatchItem[] = messageSentEvents.map(
          (messageSentEvent, i) => ({
            userId: randomUUID(),
            timestamp: new Date(Date.now() - i * 1000).toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          }),
        );
        await submitBatch({
          workspaceId,
          data: {
            batch: events,
          },
        });
      });
      it("returns the correct number of items", async () => {
        const deliveries = await searchDeliveries({
          workspaceId,
          to: [to1, to2],
          limit: 10,
        });
        expect(deliveries.items).toHaveLength(2);
        expect(deliveries.items[0]).toEqual(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            variant: expect.objectContaining({
              to: to1,
            }),
          }),
        );
        expect(deliveries.items[1]).toEqual(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            variant: expect.objectContaining({
              to: to2,
            }),
          }),
        );
      });
    });

    describe("when paginating", () => {
      beforeEach(async () => {
        const events: BatchItem[] = times(15, () => {
          const messageSentEvent: Omit<MessageSendSuccess, "type"> = {
            variant: {
              type: ChannelType.Email,
              from: "test-from@email.com",
              to: "test-to@email.com",
              body: "body",
              subject: "subject",
              provider: {
                type: EmailProviderType.Sendgrid,
              },
            },
          };
          return {
            userId: randomUUID(),
            timestamp: new Date().toISOString(),
            type: EventType.Track,
            messageId: randomUUID(),
            event: InternalEventType.MessageSent,
            properties: {
              workspaceId,
              journeyId: randomUUID(),
              nodeId: randomUUID(),
              runId: randomUUID(),
              templateId: randomUUID(),
              messageId: randomUUID(),
              ...messageSentEvent,
            },
          };
        });
        await submitBatch({
          workspaceId,
          data: {
            batch: events,
          },
        });
      });
      it("returns the correct number of items", async () => {
        let deliveries = await searchDeliveries({
          workspaceId,
          limit: 10,
        });
        if (!deliveries.cursor) {
          throw new Error("cursor is missing");
        }
        expect(deliveries.items).toHaveLength(10);
        deliveries = await searchDeliveries({
          workspaceId,
          limit: 10,
          cursor: deliveries.cursor,
        });
        expect(deliveries.items).toHaveLength(5);
        expect(deliveries.cursor).toBeUndefined();
      });
    });
  });
  describe("parseSearchDeliveryRow", () => {
    it("accepts either messageType or channel", () => {
      const row: SearchDeliveryRow = {
        sent_at: "2023-08-01 01:41:18.585",
        updated_at: "2023-08-01 01:41:18.585",
        last_event: "DFInternalMessageSent",
        origin_message_id: "043ddf20-b4a6-4e88-a7b6-15c88b9617de",
        user_or_anonymous_id: "3dae7dd0-cc99-4a76-b298-af33dd606b27",
        workspace_id: "4f0732c7-e505-45f1-b052-4d08e30e7c33",
        properties: JSON.stringify({
          body: "body",
          emailProvider: "SendGrid",
          from: "test2@email.com",
          journeyId: "d2dd13d3-d905-4a83-b9c2-eeb9c1f4bea2",
          messageType: "Email",
          nodeId: "60b133f1-9957-4aa8-a8df-8a26b8e577db",
          runId: "2dffde47-0438-423e-bc36-7c6f1d635677",
          subject: "subject",
          templateId: "bd9dad3b-7cc5-427c-8838-6aa5cbc4dd0b",
          to: "test1@email.com",
        }),
      };
      const result = parseSearchDeliveryRow(row);
      expect(result).not.toBeNull();
    });

    it("respects the deprecated format for deliveries events", () => {
      const row: SearchDeliveryRow = {
        sent_at: "2023-08-01 01:41:18.585",
        updated_at: "2023-08-01 01:41:18.585",
        last_event: "DFInternalMessageSent",
        origin_message_id: randomUUID(),
        user_or_anonymous_id: randomUUID(),
        workspace_id: randomUUID(),
        properties: JSON.stringify({
          email: "test@email.com",
          journeyId: randomUUID(),
          messageId: randomUUID(),
          nodeId: randomUUID(),
          runId: randomUUID(),
          templateId: randomUUID(),
          userId: randomUUID(),
          workspaceId: randomUUID(),
        }),
      };
      const result = parseSearchDeliveryRow(row);
      expect(result).not.toBeNull();
    });
  });
  describe("getDeliveryBody", () => {
    let userId: string;

    beforeEach(() => {
      userId = randomUUID();
    });

    describe("when filtering by journeyId and templateId", () => {
      let journeyId: string;
      let templateId: string;
      let expectedVariant: MessageSendSuccessVariant;

      beforeEach(async () => {
        journeyId = randomUUID();
        templateId = randomUUID();
        expectedVariant = {
          type: ChannelType.Email,
          from: "test-from@email.com",
          to: "test-to@email.com",
          body: "body",
          subject: "subject",
          provider: {
            type: EmailProviderType.Sendgrid,
          },
        };

        const correctEvent: BatchItem = {
          userId,
          timestamp: new Date().toISOString(),
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId,
            messageId: randomUUID(),
            variant: expectedVariant,
          },
        };

        const wrongEvent: BatchItem = {
          userId,
          timestamp: new Date().toISOString(),
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId: randomUUID(),
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: randomUUID(),
            messageId: randomUUID(),
            variant: {
              ...expectedVariant,
              body: "wrong body",
            },
          },
        };

        await submitBatch({
          workspaceId,
          data: {
            batch: [correctEvent, wrongEvent],
          },
        });
      });

      it("returns the correct body", async () => {
        const result = await getDeliveryBody({
          workspaceId,
          userId,
          journeyId,
          templateId,
        });

        expect(result).toEqual(expectedVariant);
      });
    });

    describe("when filtering by triggeringMessageId", () => {
      let triggeringMessageId: string;
      let expectedVariant: MessageSendSuccessVariant;

      beforeEach(async () => {
        triggeringMessageId = randomUUID();
        expectedVariant = {
          type: ChannelType.Email,
          from: "test-from@email.com",
          to: "test-to@email.com",
          body: "body",
          subject: "subject",
          provider: {
            type: EmailProviderType.Sendgrid,
          },
        };

        const correctEvent: BatchItem = {
          userId,
          timestamp: new Date().toISOString(),
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId: randomUUID(),
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: randomUUID(),
            messageId: randomUUID(),
            triggeringMessageId,
            variant: expectedVariant,
          },
        };

        const wrongEvent: BatchItem = {
          userId,
          timestamp: new Date().toISOString(),
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId: randomUUID(),
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: randomUUID(),
            messageId: randomUUID(),
            triggeringMessageId: randomUUID(),
            variant: {
              ...expectedVariant,
              body: "wrong body",
            },
          },
        };

        await submitBatch({
          workspaceId,
          data: {
            batch: [correctEvent, wrongEvent],
          },
        });
      });

      it("returns the correct body", async () => {
        const result = await getDeliveryBody({
          workspaceId,
          userId,
          triggeringMessageId,
        });

        expect(result).toEqual(expectedVariant);
      });
    });

    describe("when filtering by messageId", () => {
      let messageId: string;
      let expectedVariant: MessageSendSuccessVariant;

      beforeEach(async () => {
        messageId = randomUUID();
        expectedVariant = {
          type: ChannelType.Email,
          from: "test-from@email.com",
          to: "test-to@email.com",
          body: "body",
          subject: "subject",
          provider: {
            type: EmailProviderType.Sendgrid,
          },
        };

        const correctEvent: BatchItem = {
          userId,
          timestamp: new Date().toISOString(),
          type: EventType.Track,
          messageId,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId: randomUUID(),
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: randomUUID(),
            variant: expectedVariant,
          },
        };

        const wrongEvent: BatchItem = {
          userId,
          timestamp: new Date().toISOString(),
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId: randomUUID(),
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: randomUUID(),
            variant: {
              ...expectedVariant,
              body: "wrong body",
            },
          },
        };

        await submitBatch({
          workspaceId,
          data: {
            batch: [correctEvent, wrongEvent],
          },
        });
      });

      it("returns the correct body", async () => {
        const result = await getDeliveryBody({
          workspaceId,
          userId,
          messageId,
        });

        expect(result).toEqual(expectedVariant);
      });
    });
  });
});
