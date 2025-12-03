/* eslint-disable no-await-in-loop */
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { groupBy, mapToObj, mapValues } from "remeda";

import {
  getChartData,
  getJourneyEditorStats,
  getSummarizedData,
} from "./analysis";
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

    it("should not allow delivered to exceed sent within the same time bucket (currently fails)", async () => {
      // Build a clean, isolated scenario entirely outside the times used in beforeEach
      // so the window only contains our test cohort.
      const now = Date.now();
      const startOfCurrentHour =
        Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000;
      const sentBucket = startOfCurrentHour + 60 * 60 * 1000; // next hour
      const deliveredBucket = sentBucket + 60 * 60 * 1000; // hour after sent

      const testJourneyId = randomUUID();
      const testTemplateId = randomUUID();
      const testUserId = randomUUID();
      const testMessageId = randomUUID();

      const messageSentEvent: Omit<MessageSendSuccess, "type"> = {
        variant: {
          type: ChannelType.Email,
          from: "sent-bucket-from@email.com",
          to: "sent-bucket-to@email.com",
          body: "body",
          subject: "subject",
          provider: {
            type: EmailProviderType.SendGrid,
          },
        },
      };

      const events: BatchItem[] = [
        // Sent occurs in sentBucket
        {
          userId: testUserId,
          timestamp: new Date(sentBucket + 5 * 60 * 1000).toISOString(),
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
        // Delivered occurs in a later bucket (deliveredBucket)
        {
          userId: testUserId,
          timestamp: new Date(deliveredBucket + 5 * 60 * 1000).toISOString(),
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailDelivered,
          properties: {
            workspaceId,
            journeyId: testJourneyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: testTemplateId,
            messageId: testMessageId,
          },
        },
      ];

      // Submit with explicit processing times so CH buckets line up by processing_time
      await submitBatch(
        { workspaceId, data: { batch: [events[0]!] } },
        { processingTime: sentBucket + 5 * 60 * 1000 },
      );
      await submitBatch(
        { workspaceId, data: { batch: [events[1]!] } },
        { processingTime: deliveredBucket + 5 * 60 * 1000 },
      );

      const startDate = new Date(sentBucket - 5 * 60 * 1000).toISOString();
      const endDate = new Date(deliveredBucket + 30 * 60 * 1000).toISOString();

      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        groupBy: "messageState",
      });

      // Group rows by hour bucket using remeda utilities
      const byTimestamp = groupBy(result.data, (d) => d.timestamp);
      const countsByKey = mapValues(byTimestamp, (d) =>
        mapToObj(d, (dp) => [dp.groupKey ?? "", dp.count]),
      );

      Object.values(countsByKey).forEach((counts) => {
        const sent = counts.sent ?? 0;
        const delivered = counts.delivered ?? 0;
        expect(delivered).toBeLessThanOrEqual(sent);
      });
    });

    it("returns chart data with default granularity when not specified", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
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
      });

      expect(result).toHaveProperty("data");
      expect(result.data).toHaveLength(0);
    });

    it("returns chart data filtered by userIds and excludes other users' data", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      // First, verify baseline: get unfiltered data to confirm both users have messages
      const unfilteredResult = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
      });
      const unfilteredCount = unfilteredResult.data.reduce(
        (sum, point) => sum + point.count,
        0,
      );
      // Both userId1 and userId2 have messages, so unfiltered count should be 2
      expect(unfilteredCount).toBe(2);

      // Now filter by userId1 only - should EXCLUDE userId2's messages
      const filteredResult = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        filters: {
          userIds: [userId1],
        },
      });

      expect(filteredResult).toHaveProperty("data");
      expect(Array.isArray(filteredResult.data)).toBe(true);

      const filteredCount = filteredResult.data.reduce(
        (sum, point) => sum + point.count,
        0,
      );
      // Should only include userId1's message (1), excluding userId2's message
      expect(filteredCount).toBe(1);
      // Verify exclusion: filtered count should be less than unfiltered count
      expect(filteredCount).toBeLessThan(unfilteredCount);
    });

    it("returns chart data filtered by multiple userIds", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      // Filter by both userId1 and userId2 - should include both users' messages
      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        filters: {
          userIds: [userId1, userId2],
        },
      });

      expect(result).toHaveProperty("data");
      expect(Array.isArray(result.data)).toBe(true);

      const totalCount = result.data.reduce(
        (sum, point) => sum + point.count,
        0,
      );
      // Both users have 1 sent message each
      expect(totalCount).toBe(2);
    });

    it("returns empty data when filtering by non-existent userId", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getChartData({
        workspaceId,
        startDate,
        endDate,
        granularity: "1hour",
        filters: {
          userIds: [randomUUID()], // Non-existent user
        },
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

    it("does not count orphan statuses and deliveries never exceed sent in summary", async () => {
      // Create an isolated time window and events
      const now = Date.now();
      const startOfNextHour =
        Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000 + 60 * 60 * 1000;
      const sentAt = startOfNextHour + 5 * 60 * 1000;
      const deliveredAt = startOfNextHour + 65 * 60 * 1000; // +1h 5m

      const testJourneyId = randomUUID();
      const testTemplateId = randomUUID();
      const testUserId = randomUUID();
      const testMessageId = randomUUID();

      const messageSentEvent: Omit<MessageSendSuccess, "type"> = {
        variant: {
          type: ChannelType.Email,
          from: "summary-from@email.com",
          to: "summary-to@email.com",
          body: "body",
          subject: "subject",
          provider: { type: EmailProviderType.SendGrid },
        },
      };

      const events: BatchItem[] = [
        {
          userId: testUserId,
          timestamp: new Date(sentAt).toISOString(),
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
        // Valid delivered for the sent message (later bucket)
        {
          userId: testUserId,
          timestamp: new Date(deliveredAt).toISOString(),
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailDelivered,
          properties: {
            workspaceId,
            journeyId: testJourneyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: testTemplateId,
            messageId: testMessageId,
          },
        },
        // Orphan delivered that should be ignored (no matching sent in cohort)
        {
          userId: randomUUID(),
          timestamp: new Date(deliveredAt).toISOString(),
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailDelivered,
          properties: {
            workspaceId,
            journeyId: testJourneyId,
            nodeId: randomUUID(),
            runId: randomUUID(),
            templateId: testTemplateId,
            messageId: randomUUID(),
          },
        },
      ];

      await submitBatch(
        { workspaceId, data: { batch: [events[0]!] } },
        { processingTime: sentAt },
      );
      await submitBatch(
        { workspaceId, data: { batch: [events[1]!] } },
        { processingTime: deliveredAt },
      );
      await submitBatch(
        { workspaceId, data: { batch: [events[2]!] } },
        { processingTime: deliveredAt },
      );

      const startDate = new Date(sentAt - 5 * 60 * 1000).toISOString();
      const endDate = new Date(deliveredAt + 10 * 60 * 1000).toISOString();

      const summary = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
        filters: { channel: ChannelType.Email },
      });

      expect(summary.summary.sent).toBe(1);
      expect(summary.summary.deliveries).toBe(1);
      // Invariant: deliveries should never exceed sent
      expect(summary.summary.deliveries).toBeLessThanOrEqual(
        summary.summary.sent,
      );
    });

    it("returns default behavior (sent messages only) when no channel is specified", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
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
      });

      expect(result).toHaveProperty("summary");
      expect(result.summary.deliveries).toBe(0);
      expect(result.summary.sent).toBe(0);
      expect(result.summary.opens).toBe(0);
      expect(result.summary.clicks).toBe(0);
      expect(result.summary.bounces).toBe(0);
    });

    it("returns summarized data filtered by userIds and excludes other users' data", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      // First, verify baseline: get unfiltered data to confirm both users have messages
      const unfilteredResult = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
      });
      // Both userId1 and userId2 have messages
      expect(unfilteredResult.summary.sent).toBe(2);

      // Now filter by userId1 only - should EXCLUDE userId2's messages
      const filteredResult = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
        filters: {
          userIds: [userId1],
        },
      });

      expect(filteredResult).toHaveProperty("summary");
      // Should only include userId1's message (1), excluding userId2's message
      expect(filteredResult.summary.sent).toBe(1);
      // Verify exclusion: filtered count should be less than unfiltered count
      expect(filteredResult.summary.sent).toBeLessThan(
        unfilteredResult.summary.sent,
      );
    });

    it("returns summarized data filtered by multiple userIds", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      // Filter by both userId1 and userId2 - should include both users' messages
      const result = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
        filters: {
          userIds: [userId1, userId2],
        },
      });

      expect(result).toHaveProperty("summary");
      // Both users have 1 sent message each
      expect(result.summary.sent).toBe(2);
    });

    it("returns zero metrics when filtering by non-existent userId", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getSummarizedData({
        workspaceId,
        startDate,
        endDate,
        filters: {
          userIds: [randomUUID()], // Non-existent user
        },
      });

      expect(result).toHaveProperty("summary");
      expect(result.summary.sent).toBe(0);
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

  describe("getJourneyEditorStats", () => {
    let journeyId: string;
    let templateId: string;
    let userId1: string;
    let userId2: string;
    let nodeId1: string;
    let nodeId2: string;

    beforeEach(async () => {
      journeyId = randomUUID();
      templateId = randomUUID();
      userId1 = randomUUID();
      userId2 = randomUUID();
      nodeId1 = randomUUID();
      nodeId2 = randomUUID();

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
      const sentMessageId3 = randomUUID();

      const events: BatchItem[] = [
        // Node 1: Message sent + delivered + opened
        {
          userId: userId1,
          timestamp: new Date(now.getTime() - 3600000).toISOString(), // 1 hour ago
          type: EventType.Track,
          messageId: sentMessageId1,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId,
            nodeId: nodeId1,
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId1,
            ...messageSentEvent,
          },
        },
        {
          userId: userId1,
          timestamp: new Date(now.getTime() - 3590000).toISOString(), // ~1 hour ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailDelivered,
          properties: {
            workspaceId,
            journeyId,
            nodeId: nodeId1,
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId1, // Reference the original sent message
          },
        },
        {
          userId: userId1,
          timestamp: new Date(now.getTime() - 3580000).toISOString(), // ~1 hour ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailOpened,
          properties: {
            workspaceId,
            journeyId,
            nodeId: nodeId1,
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId1, // Reference the original sent message
          },
        },
        // Node 1: Second message sent + clicked (should cascade to opened and delivered)
        {
          userId: userId2,
          timestamp: new Date(now.getTime() - 1800000).toISOString(), // 30 minutes ago
          type: EventType.Track,
          messageId: sentMessageId2,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId,
            nodeId: nodeId1,
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId2,
            ...messageSentEvent,
          },
        },
        {
          userId: userId2,
          timestamp: new Date(now.getTime() - 1790000).toISOString(), // ~30 minutes ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailClicked,
          properties: {
            workspaceId,
            journeyId,
            nodeId: nodeId1,
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId2, // Reference the original sent message
          },
        },
        // Node 2: Message sent + bounced
        {
          userId: randomUUID(),
          timestamp: new Date(now.getTime() - 2700000).toISOString(), // 45 minutes ago
          type: EventType.Track,
          messageId: sentMessageId3,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId,
            nodeId: nodeId2,
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId3,
            ...messageSentEvent,
          },
        },
        {
          userId: randomUUID(),
          timestamp: new Date(now.getTime() - 2690000).toISOString(), // ~45 minutes ago
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailBounced,
          properties: {
            workspaceId,
            journeyId,
            nodeId: nodeId2,
            runId: randomUUID(),
            templateId,
            messageId: sentMessageId3, // Reference the original sent message
          },
        },
      ];

      // Submit events with specific processing times
      const baseTime = new Date();
      const eventTimes = [
        baseTime.getTime() - 3600000, // 1 hour ago
        baseTime.getTime() - 3590000, // ~1 hour ago (for delivered)
        baseTime.getTime() - 3580000, // ~1 hour ago (for opened)
        baseTime.getTime() - 1800000, // 30 minutes ago
        baseTime.getTime() - 1790000, // ~30 minutes ago (for clicked)
        baseTime.getTime() - 2700000, // 45 minutes ago
        baseTime.getTime() - 2690000, // ~45 minutes ago (for bounced)
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

    it("returns journey editor stats with proper node-level aggregation and cascading logic", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getJourneyEditorStats({
        workspaceId,
        journeyId,
        startDate,
        endDate,
      });

      expect(result).toHaveProperty("nodeStats");
      expect(typeof result.nodeStats).toBe("object");

      // Verify node 1 stats (2 messages: 1 with open, 1 with click)
      expect(result.nodeStats[nodeId1]).toBeDefined();
      const node1Stats = result.nodeStats[nodeId1];
      if (!node1Stats) throw new Error("Node1 stats should be defined");

      expect(node1Stats.sent).toBe(2); // 2 messages sent
      expect(node1Stats.delivered).toBe(2); // Both messages delivered (1 explicit + 1 from click cascade)
      expect(node1Stats.opened).toBe(2); // Both messages opened (1 explicit + 1 from click cascade)
      expect(node1Stats.clicked).toBe(1); // 1 message clicked
      expect(node1Stats.bounced).toBe(0); // No bounces in node 1

      // Verify node 2 stats (1 message: bounced)
      expect(result.nodeStats[nodeId2]).toBeDefined();
      const node2Stats = result.nodeStats[nodeId2];
      if (!node2Stats) throw new Error("Node2 stats should be defined");

      expect(node2Stats.sent).toBe(1); // 1 message sent
      expect(node2Stats.delivered).toBe(0); // No deliveries (bounced message doesn't count as delivered)
      expect(node2Stats.opened).toBe(0); // No opens
      expect(node2Stats.clicked).toBe(0); // No clicks
      expect(node2Stats.bounced).toBe(1); // 1 bounce
    });

    it("returns empty stats for non-existent journey", async () => {
      const startDate = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      const endDate = new Date().toISOString();

      const result = await getJourneyEditorStats({
        workspaceId,
        journeyId: randomUUID(), // Non-existent journey
        startDate,
        endDate,
      });

      expect(result).toHaveProperty("nodeStats");
      expect(Object.keys(result.nodeStats)).toHaveLength(0);
    });

    it("returns zero stats for date range with no events", async () => {
      const startDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      const endDate = new Date(Date.now() + 7200000).toISOString(); // 2 hours from now

      const result = await getJourneyEditorStats({
        workspaceId,
        journeyId,
        startDate,
        endDate,
      });

      expect(result).toHaveProperty("nodeStats");
      expect(Object.keys(result.nodeStats)).toHaveLength(0);
    });

    it("correctly deduplicates multiple events for the same message in the same node", async () => {
      // Create a test case where the same message has multiple opens/clicks
      const testJourneyId = randomUUID();
      const testNodeId = randomUUID();
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
        // Message sent
        {
          userId: testUserId,
          timestamp: new Date(now.getTime() - 3600000).toISOString(),
          type: EventType.Track,
          messageId: testMessageId,
          event: InternalEventType.MessageSent,
          properties: {
            workspaceId,
            journeyId: testJourneyId,
            nodeId: testNodeId,
            runId: randomUUID(),
            templateId: testTemplateId,
            messageId: testMessageId,
            ...messageSentEvent,
          },
        },
        // Multiple open events for the same message (should be deduplicated)
        {
          userId: testUserId,
          timestamp: new Date(now.getTime() - 3590000).toISOString(),
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailOpened,
          properties: {
            workspaceId,
            journeyId: testJourneyId,
            nodeId: testNodeId,
            runId: randomUUID(),
            templateId: testTemplateId,
            messageId: testMessageId,
          },
        },
        {
          userId: testUserId,
          timestamp: new Date(now.getTime() - 3580000).toISOString(),
          type: EventType.Track,
          messageId: randomUUID(),
          event: InternalEventType.EmailOpened,
          properties: {
            workspaceId,
            journeyId: testJourneyId,
            nodeId: testNodeId,
            runId: randomUUID(),
            templateId: testTemplateId,
            messageId: testMessageId, // Same message ID
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

      const startDate = new Date(Date.now() - 7200000).toISOString();
      const endDate = new Date().toISOString();

      const result = await getJourneyEditorStats({
        workspaceId,
        journeyId: testJourneyId,
        startDate,
        endDate,
      });

      expect(result.nodeStats[testNodeId]).toBeDefined();
      const nodeStats = result.nodeStats[testNodeId];
      if (!nodeStats) throw new Error("Node stats should be defined");

      // Despite multiple open events, should only count as 1 opened message
      expect(nodeStats.sent).toBe(1);
      expect(nodeStats.delivered).toBe(1); // From open cascade
      expect(nodeStats.opened).toBe(1); // Should be deduplicated
      expect(nodeStats.clicked).toBe(0);
      expect(nodeStats.bounced).toBe(0);
    });
  });
});
