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
  SmsProviderType,
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
        expect(point).toHaveProperty("count");
        expect(typeof point.timestamp).toBe("string");
        expect(typeof point.count).toBe("number");
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

    it("returns chart data grouped by journey with separate counts for different journeys", async () => {
      // Create a second journey with different messages
      const secondJourneyId = randomUUID();
      const secondTemplateId = randomUUID();
      const userId3 = randomUUID();
      const userId4 = randomUUID();

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
      const sentMessageId3 = randomUUID();
      const sentMessageId4 = randomUUID();

      // Create events for the second journey
      const secondJourneyEvents: BatchItem[] = [
        {
          userId: userId3,
          timestamp: new Date(now.getTime() - 3600000).toISOString(), // 1 hour ago
          type: EventType.Track,
          messageId: sentMessageId3,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId: secondJourneyId, // Different journey
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: secondTemplateId,
            messageId: sentMessageId3,
            ...messageSentEvent,
          },
        },
        {
          userId: userId4,
          timestamp: new Date(now.getTime() - 1800000).toISOString(), // 30 minutes ago
          type: EventType.Track,
          messageId: sentMessageId4,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId: secondJourneyId, // Different journey
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: secondTemplateId,
            messageId: sentMessageId4,
            ...messageSentEvent,
          },
        },
        // Add an additional event for the second journey to make counts different
        {
          userId: randomUUID(),
          timestamp: new Date(now.getTime() - 2700000).toISOString(), // 45 minutes ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId: secondJourneyId, // Different journey
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: secondTemplateId,
            messageId: randomUUID(),
            ...messageSentEvent,
          },
        },
      ];

      // Submit the second journey events
      const eventTimes = [
        now.getTime() - 3600000, // 1 hour ago
        now.getTime() - 1800000, // 30 minutes ago
        now.getTime() - 2700000, // 45 minutes ago
      ];

      for (let i = 0; i < secondJourneyEvents.length; i++) {
        const event = secondJourneyEvents[i];
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
      expect(result.data.length).toBeGreaterThan(0);

      // Verify we have data points for both journeys
      const journeyGroups = new Set(result.data.map((point) => point.groupKey));
      expect(journeyGroups.has(journeyId)).toBe(true); // Original journey
      expect(journeyGroups.has(secondJourneyId)).toBe(true); // New journey

      // Verify counts are different between journeys
      const firstJourneyPoints = result.data.filter(
        (point) => point.groupKey === journeyId,
      );
      const secondJourneyPoints = result.data.filter(
        (point) => point.groupKey === secondJourneyId,
      );

      expect(firstJourneyPoints.length).toBeGreaterThan(0);
      expect(secondJourneyPoints.length).toBeGreaterThan(0);

      // Sum up counts for each journey
      const firstJourneyTotal = firstJourneyPoints.reduce(
        (sum, point) => sum + point.count,
        0,
      );
      const secondJourneyTotal = secondJourneyPoints.reduce(
        (sum, point) => sum + point.count,
        0,
      );

      // First journey should have 2 messages, second journey should have 3 messages
      expect(firstJourneyTotal).toBe(2);
      expect(secondJourneyTotal).toBe(3);

      // Verify all points have proper structure
      result.data.forEach((point) => {
        expect(point).toHaveProperty("timestamp");
        expect(point).toHaveProperty("count");
        expect(point).toHaveProperty("groupKey");
        expect(typeof point.timestamp).toBe("string");
        expect(typeof point.count).toBe("number");
        expect(typeof point.groupKey).toBe("string");
        expect([journeyId, secondJourneyId]).toContain(point.groupKey);
      });
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

    it("returns chart data grouped by message state with human-readable labels", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        displayMode: "absolute",
        groupBy: "messageState",
      });

      expect(result).toHaveProperty("data");
      expect(Array.isArray(result.data)).toBe(true);

      if (result.data.length > 0) {
        // Verify that groupKeys are human-readable labels, not raw event names
        const groupKeys = result.data
          .map((point) => point.groupKey)
          .filter(Boolean);
        const expectedLabels = [
          "sent",
          "delivered",
          "opened",
          "clicked",
          "bounced",
        ];

        groupKeys.forEach((key) => {
          expect(expectedLabels).toContain(key);
          // Ensure no raw event names like "DFInternalMessageSent" or "DFEmailOpened"
          expect(key).not.toMatch(/^DF/);
        });
      }
    });

    it("returns chart data with provider filter", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        displayMode: "absolute",
        filters: {
          providers: ["SendGrid"],
        },
      });

      expect(result).toHaveProperty("data");
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("returns chart data with channel filter", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        displayMode: "absolute",
        filters: {
          channels: ["Email"],
        },
      });

      expect(result).toHaveProperty("data");
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("returns zero counts when filtering by SMS channel with only email events", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      // Filter by SMS channel, but all our test data is email events
      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        displayMode: "absolute",
        filters: {
          channels: ["Sms"],
        },
      });

      expect(result).toHaveProperty("data");
      expect(Array.isArray(result.data)).toBe(true);

      // Should have no data since all events in beforeEach are email events
      expect(result.data.length).toBe(0);
    });

    it("correctly includes SMS events when filtering by SMS channel", async () => {
      // Create SMS events
      const smsJourneyId = randomUUID();
      const smsTemplateId = randomUUID();
      const smsUserId = randomUUID();
      const smsSentMessageId = randomUUID();

      const smsMessageSentEvent: Omit<MessageSendSuccess, "type"> = {
        variant: {
          type: ChannelType.Sms,
          to: "+1234567890",
          body: "Test SMS message",
          provider: {
            type: SmsProviderType.Twilio,
            sid: randomUUID(),
          },
        },
      };

      const now = new Date();
      const smsEvents: BatchItem[] = [
        {
          userId: smsUserId,
          timestamp: new Date(now.getTime() - 3600000).toISOString(), // 1 hour ago
          type: EventType.Track,
          messageId: smsSentMessageId,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId: smsJourneyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: smsTemplateId,
            messageId: smsSentMessageId,
            ...smsMessageSentEvent,
          },
        },
        {
          userId: smsUserId,
          timestamp: new Date(now.getTime() - 3590000).toISOString(), // ~1 hour ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.SmsDelivered,
          properties: {
            workspaceId,
            journeyId: smsJourneyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: smsTemplateId,
            messageId: smsSentMessageId,
          },
        },
      ];

      // Submit SMS events
      for (let i = 0; i < smsEvents.length; i++) {
        const event = smsEvents[i];
        if (event) {
          await submitBatch(
            {
              workspaceId,
              data: {
                batch: [event],
              },
            },
            {
              processingTime: now.getTime() - 3600000 + i * 10000, // Slight time offset
            },
          );
        }
      }

      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      // Filter by SMS channel - should now include the SMS events
      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        displayMode: "absolute",
        filters: {
          channels: ["Sms"],
        },
      });

      expect(result).toHaveProperty("data");
      expect(Array.isArray(result.data)).toBe(true);

      // Should have data now since we added SMS events
      expect(result.data.length).toBeGreaterThan(0);

      // Total count should be 1 (one unique SMS message)
      const totalCount = result.data.reduce(
        (sum, point) => sum + point.count,
        0,
      );
      expect(totalCount).toBe(1);
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
        expect(point).toHaveProperty("count");
        expect(typeof point.timestamp).toBe("string");
        expect(typeof point.count).toBe("number");
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
        {
          userId: userId1,
          timestamp: new Date(now.getTime() - 3580000).toISOString(), // ~1 hour ago
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
      expect(result.summary).toHaveProperty("sent");
      expect(result.summary).toHaveProperty("opens");
      expect(result.summary).toHaveProperty("clicks");
      expect(result.summary).toHaveProperty("bounces");

      expect(typeof result.summary.deliveries).toBe("number");
      expect(typeof result.summary.sent).toBe("number");
      expect(typeof result.summary.opens).toBe("number");
      expect(typeof result.summary.clicks).toBe("number");
      expect(typeof result.summary.bounces).toBe("number");

      // Verify we have the expected counts based on our test data
      // Default behavior now only tracks sent messages for both deliveries and sent
      expect(result.summary.sent).toBe(2); // 2 unique sent messages
      expect(result.summary.deliveries).toBe(0); // 0 unique deliveries
      expect(result.summary.opens).toBe(0); // Not tracked in default mode
      expect(result.summary.clicks).toBe(0); // Not tracked in default mode
      expect(result.summary.bounces).toBe(0); // Not tracked in default mode
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
      expect(result.summary.sent).toBe(2);
      expect(result.summary.deliveries).toBe(0);
      expect(result.summary.opens).toBe(0); // Not tracked in default mode
      expect(result.summary.clicks).toBe(0); // Not tracked in default mode
      expect(result.summary.bounces).toBe(0); // Not tracked in default mode
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
      expect(result.summary.sent).toBe(2);
      expect(result.summary.deliveries).toBe(0);
      expect(result.summary.opens).toBe(0); // Not tracked in default mode
      expect(result.summary.clicks).toBe(0); // Not tracked in default mode
      expect(result.summary.bounces).toBe(0); // Not tracked in default mode
    });

    it("returns email-specific metrics when email channel is specified", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
        displayMode: "absolute",
        filters: {
          channel: ChannelType.Email,
        },
      });

      expect(result).toHaveProperty("summary");
      expect(result.summary.sent).toBe(2); // 2 email messages sent
      expect(result.summary.deliveries).toBe(1); // 1 email actually delivered (from EmailDelivered event)
      expect(result.summary.opens).toBe(1); // 1 email opened
      expect(result.summary.clicks).toBe(1); // 1 email clicked
      expect(result.summary.bounces).toBe(1); // 1 email bounced
    });

    it("demonstrates cascading logic in getSummarizedData - opens contribute to deliveries", async () => {
      // Create a message that only has an open event (no explicit delivery)
      const testJourneyId = randomUUID();
      const testTemplateId = randomUUID();
      const testUserId = randomUUID();
      const testMessageId = randomUUID();

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
      const events: BatchItem[] = [
        // Only MessageSent + EmailOpened (no explicit EmailDelivered)
        {
          userId: testUserId,
          timestamp: new Date(now.getTime() - 3600000).toISOString(), // 1 hour ago
          type: EventType.Track,
          messageId: testMessageId,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId: testJourneyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: testTemplateId,
            messageId: testMessageId,
            ...messageSentEvent,
          },
        },
        {
          userId: testUserId,
          timestamp: new Date(now.getTime() - 3580000).toISOString(), // ~1 hour ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailOpened,
          properties: {
            workspaceId,
            journeyId: testJourneyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: testTemplateId,
            messageId: testMessageId, // Reference the original sent message
          },
        },
      ];

      // Submit events
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
              processingTime: now.getTime() - 3600000 + i * 10000,
            },
          );
        }
      }

      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
        displayMode: "absolute",
        filters: {
          channel: ChannelType.Email,
        },
      });

      expect(result).toHaveProperty("summary");

      // This message only had MessageSent + EmailOpened (no explicit EmailDelivered)
      // But with cascading logic:
      // - deliveries should count this message because it had an open (opens cascade to deliveries)
      // - opens should count this message
      // - clicks should be 0

      // Note: This adds to the previous test data, so we expect:
      // Original: 2 sent, 1 delivery, 1 open, 1 click, 1 bounce
      // New: +1 sent, +1 delivery (from open cascade), +1 open
      expect(result.summary.sent).toBe(3); // 2 + 1 new message
      expect(result.summary.deliveries).toBe(2); // 1 + 1 new delivery (from open cascade)
      expect(result.summary.opens).toBe(2); // 1 + 1 new open
      expect(result.summary.clicks).toBe(1); // Same as before
      expect(result.summary.bounces).toBe(1); // Same as before
    });

    it("returns default behavior (sent messages only) when no channel is specified", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
        displayMode: "absolute",
        // No channel specified
      });

      expect(result).toHaveProperty("summary");
      expect(result.summary.sent).toBe(2); // 2 messages sent
      expect(result.summary.deliveries).toBe(0); // 0 messages sent (default behavior)
      expect(result.summary.opens).toBe(0); // Not tracked in default mode
      expect(result.summary.clicks).toBe(0); // Not tracked in default mode
      expect(result.summary.bounces).toBe(0); // Not tracked in default mode
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
      expect(result.summary.sent).toBe(0);
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
      expect(result.summary.sent).toBe(0);
      expect(result.summary.opens).toBe(0);
      expect(result.summary.clicks).toBe(0);
      expect(result.summary.bounces).toBe(0);
    });
  });

  describe("getSummarizedData with SMS channel", () => {
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
          type: ChannelType.Sms,
          to: "+1234567890",
          body: "Test SMS message",
          provider: {
            type: SmsProviderType.Twilio,
            sid: randomUUID(),
          },
        },
      };

      const now = new Date();

      // Create message IDs for sent messages
      const sentMessageId1 = randomUUID();
      const sentMessageId2 = randomUUID();

      const events: BatchItem[] = [
        // SMS sent events
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
        // SMS delivered event - reference the original sent message
        {
          userId: userId1,
          timestamp: new Date(now.getTime() - 3590000).toISOString(), // ~1 hour ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.SmsDelivered,
          properties: {
            workspaceId,
            journeyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId1, // Reference the original sent message
          },
        },
        // SMS failed event - reference the original sent message
        {
          userId: userId2,
          timestamp: new Date(now.getTime() - 1790000).toISOString(), // ~30 minutes ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.SmsFailed,
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

      // Submit events with specific processing times
      const baseTime = new Date();
      const eventTimes = [
        baseTime.getTime() - 3600000, // 1 hour ago
        baseTime.getTime() - 1800000, // 30 minutes ago
        baseTime.getTime() - 3590000, // ~1 hour ago (for delivered)
        baseTime.getTime() - 1790000, // ~30 minutes ago (for failed)
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

    it("returns SMS-specific metrics when SMS channel is specified", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
        displayMode: "absolute",
        filters: {
          channel: ChannelType.Sms,
        },
      });

      expect(result).toHaveProperty("summary");
      expect(result.summary.sent).toBe(2); // 2 SMS messages sent
      expect(result.summary.deliveries).toBe(1); // 1 SMS actually delivered (from SmsDelivered event)
      expect(result.summary.opens).toBe(0); // SMS doesn't have opens
      expect(result.summary.clicks).toBe(0); // SMS doesn't have clicks
      expect(result.summary.bounces).toBe(1); // 1 SMS failed (treated as bounce)
    });
  });
});
