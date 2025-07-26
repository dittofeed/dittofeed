/* eslint-disable no-await-in-loop */
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { getChartData, getSummarizedData } from "./analysis";
import { submitBatch } from "./apps/batch";
import {
  BatchItem,
  ChannelType,
  EmailProviderType,
  EventType,
  InternalEventType,
  MessageSendSuccess,
} from "./types";
import { createWorkspace } from "./workspaces";

describe("analysis", () => {
  let workspaceId: string;

  beforeEach(async () => {
    const workspace = unwrap(
      await createWorkspace({
        name: `test-workspace-${randomUUID()}`,
      }),
    );
    workspaceId = workspace.id;
  });

  describe("getChartData", () => {
    let journeyId: string;
    let templateId: string;
    let userId1: string;
    let userId2: string;

    beforeEach(async () => {
      journeyId = randomUUID();
      templateId = randomUUID();
      userId1 = randomUUID();
      userId2 = randomUUID();

      const messageSentEvent: Omit<MessageSendSuccess, "type"> = {
        variant: {
          type: ChannelType.Email,
          from: "test-from@email.com",
          to: "test-to@email.com",
          body: "body",
          subject: "subject",
          provider: {
            type: EmailProviderType.SendGrid,
          },
        },
      };

      const now = new Date();
      
      // Create message IDs for sent messages
      const sentMessageId1 = randomUUID();
      const sentMessageId2 = randomUUID();
      
      const events: BatchItem[] = [
        // Message sent events
        {
          userId: userId1,
          timestamp: new Date(now.getTime() - 3600000).toISOString(), // 1 hour ago
          type: EventType.Track,
          messageId: sentMessageId1,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId1,
            ...messageSentEvent,
          },
        },
        {
          userId: userId2,
          timestamp: new Date(now.getTime() - 1800000).toISOString(), // 30 minutes ago
          type: EventType.Track,
          messageId: sentMessageId2,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId2,
            ...messageSentEvent,
          },
        },
        // Email delivered events - reference the original sent message
        {
          userId: userId1,
          timestamp: new Date(now.getTime() - 3590000).toISOString(), // ~1 hour ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailDelivered,
          properties: {
            workspaceId,
            journeyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId1, // Reference the original sent message
          },
        },
        // Email opened events - reference the original sent message
        {
          userId: userId1,
          timestamp: new Date(now.getTime() - 3580000).toISOString(), // ~1 hour ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailOpened,
          properties: {
            workspaceId,
            journeyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId1, // Reference the original sent message
          },
        },
      ];

      // Submit events with specific processing times to control when they appear in the data
      const baseTime = new Date();
      const eventTimes = [
        baseTime.getTime() - 3600000, // 1 hour ago
        baseTime.getTime() - 1800000, // 30 minutes ago
        baseTime.getTime() - 3590000, // ~1 hour ago (for delivered)
        baseTime.getTime() - 3580000, // ~1 hour ago (for opened)
      ];

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        if (event) {
          await submitBatch(
            {
              workspaceId,
              data: {
                batch: [event],
              },
            },
            {
              processingTime: eventTimes[i],
            },
          );
        }
      }
    });

    it("returns chart data with auto granularity", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "auto",
        displayMode: "absolute",
      });

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("granularity");
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(typeof result.granularity).toBe("string");
      expect(result.granularity).not.toBe("auto"); // Should be resolved

      // Check that each data point has the required properties
      result.data.forEach((point) => {
        expect(point).toHaveProperty("timestamp");
        expect(point).toHaveProperty("value");
        expect(typeof point.timestamp).toBe("string");
        expect(typeof point.value).toBe("number");
      });
    });

    it("returns chart data with specific granularity", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        displayMode: "absolute",
      });

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("granularity");
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.granularity).toBe("1hour"); // Should return the specific granularity
    });

    it("returns chart data grouped by journey", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        displayMode: "absolute",
        groupBy: "journey",
      });

      expect(result).toHaveProperty("data");
      expect(Array.isArray(result.data)).toBe(true);

      // Check that grouped data has groupKey and groupLabel
      if (result.data.length > 0) {
        const firstPoint = result.data[0];
        if (firstPoint?.groupKey) {
          expect(typeof firstPoint.groupKey).toBe("string");
        }
      }
    });

    it("returns chart data with journey filter", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        displayMode: "absolute",
        filters: {
          journeyIds: [journeyId],
        },
      });

      expect(result).toHaveProperty("data");
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("returns chart data with message state filter", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        displayMode: "absolute",
        filters: {
          messageStates: [InternalEventType.MessageSent],
        },
      });

      expect(result).toHaveProperty("data");
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("returns chart data with default granularity when not specified", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        displayMode: "absolute",
      });

      expect(result).toHaveProperty("data");
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);

      // Check that each data point has the required properties
      result.data.forEach((point) => {
        expect(point).toHaveProperty("timestamp");
        expect(point).toHaveProperty("value");
        expect(typeof point.timestamp).toBe("string");
        expect(typeof point.value).toBe("number");
      });
    });

    it("returns empty data for non-existent workspace", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getChartData({
        workspaceId: randomUUID(),
        startDate,
        endDate,
        granularity: "1hour",
        displayMode: "absolute",
      });

      expect(result).toHaveProperty("data");
      expect(result.data).toHaveLength(0);
    });
  });

  describe("getSummarizedData", () => {
    let journeyId: string;
    let templateId: string;
    let userId1: string;
    let userId2: string;

    beforeEach(async () => {
      journeyId = randomUUID();
      templateId = randomUUID();
      userId1 = randomUUID();
      userId2 = randomUUID();

      const messageSentEvent: Omit<MessageSendSuccess, "type"> = {
        variant: {
          type: ChannelType.Email,
          from: "test-from@email.com",
          to: "test-to@email.com",
          body: "body",
          subject: "subject",
          provider: {
            type: EmailProviderType.SendGrid,
          },
        },
      };

      const now = new Date();
      
      // Create message IDs for sent messages
      const sentMessageId1 = randomUUID();
      const sentMessageId2 = randomUUID();
      
      const events: BatchItem[] = [
        // Message sent events
        {
          userId: userId1,
          timestamp: new Date(now.getTime() - 3600000).toISOString(), // 1 hour ago
          type: EventType.Track,
          messageId: sentMessageId1,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId1,
            ...messageSentEvent,
          },
        },
        {
          userId: userId2,
          timestamp: new Date(now.getTime() - 1800000).toISOString(), // 30 minutes ago
          type: EventType.Track,
          messageId: sentMessageId2,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId2,
            ...messageSentEvent,
          },
        },
        // Email opened events - reference the original sent message
        {
          userId: userId1,
          timestamp: new Date(now.getTime() - 3580000).toISOString(), // ~1 hour ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailOpened,
          properties: {
            workspaceId,
            journeyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId1, // Reference the original sent message
          },
        },
        // Email clicked events - reference the original sent message
        {
          userId: userId1,
          timestamp: new Date(now.getTime() - 3570000).toISOString(), // ~1 hour ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailClicked,
          properties: {
            workspaceId,
            journeyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId1, // Reference the original sent message
          },
        },
        // Email bounced events - reference the original sent message
        {
          userId: userId2,
          timestamp: new Date(now.getTime() - 1790000).toISOString(), // ~30 minutes ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailBounced,
          properties: {
            workspaceId,
            journeyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId2, // Reference the original sent message
          },
        },
      ];

      // Submit events with specific processing times to control when they appear in the data
      const baseTime = new Date();
      const eventTimes = [
        baseTime.getTime() - 3600000, // 1 hour ago
        baseTime.getTime() - 1800000, // 30 minutes ago
        baseTime.getTime() - 3580000, // ~1 hour ago (for opened)
        baseTime.getTime() - 3570000, // ~1 hour ago (for clicked)
        baseTime.getTime() - 1790000, // ~30 minutes ago (for bounced)
      ];

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        if (event) {
          await submitBatch(
            {
              workspaceId,
              data: {
                batch: [event],
              },
            },
            {
              processingTime: eventTimes[i],
            },
          );
        }
      }
    });

    it("returns summarized metrics", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
        displayMode: "absolute",
      });

      expect(result).toHaveProperty("summary");
      expect(result.summary).toHaveProperty("deliveries");
      expect(result.summary).toHaveProperty("opens");
      expect(result.summary).toHaveProperty("clicks");
      expect(result.summary).toHaveProperty("bounces");

      expect(typeof result.summary.deliveries).toBe("number");
      expect(typeof result.summary.opens).toBe("number");
      expect(typeof result.summary.clicks).toBe("number");
      expect(typeof result.summary.bounces).toBe("number");

      // Verify we have the expected counts based on our test data
      // Now counts unique deliveries (messages) rather than events
      expect(result.summary.deliveries).toBe(2); // 2 unique sent messages
      expect(result.summary.opens).toBe(1); // 1 unique message was opened (sentMessageId1)
      expect(result.summary.clicks).toBe(1); // 1 unique message was clicked (sentMessageId1)
      expect(result.summary.bounces).toBe(1); // 1 unique message bounced (sentMessageId2)
    });

    it("returns summarized metrics with journey filter", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
        displayMode: "absolute",
        filters: {
          journeyIds: [journeyId],
        },
      });

      expect(result).toHaveProperty("summary");
      expect(result.summary.deliveries).toBe(2);
      expect(result.summary.opens).toBe(1);
      expect(result.summary.clicks).toBe(1);
      expect(result.summary.bounces).toBe(1);
    });

    it("returns summarized metrics with message state filter", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
        displayMode: "absolute",
        filters: {
          messageStates: [
            InternalEventType.MessageSent,
            InternalEventType.EmailOpened,
          ],
        },
      });

      expect(result).toHaveProperty("summary");
      expect(result.summary.deliveries).toBe(2);
      expect(result.summary.opens).toBe(1);
      expect(result.summary.clicks).toBe(0); // Filtered out
      expect(result.summary.bounces).toBe(0); // Filtered out
    });

    it("returns zero metrics for non-existent workspace", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getSummarizedData({
        workspaceId: randomUUID(),
        startDate,
        endDate,
        displayMode: "absolute",
      });

      expect(result).toHaveProperty("summary");
      expect(result.summary.deliveries).toBe(0);
      expect(result.summary.opens).toBe(0);
      expect(result.summary.clicks).toBe(0);
      expect(result.summary.bounces).toBe(0);
    });

    it("returns zero metrics for date range with no events", async () => {
      const startDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      const endDate = new Date(Date.now() + 7200000).toISOString(); // 2 hours from now

      const result = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
        displayMode: "absolute",
      });

      expect(result).toHaveProperty("summary");
      expect(result.summary.deliveries).toBe(0);
      expect(result.summary.opens).toBe(0);
      expect(result.summary.clicks).toBe(0);
      expect(result.summary.bounces).toBe(0);
    });
  });
});
