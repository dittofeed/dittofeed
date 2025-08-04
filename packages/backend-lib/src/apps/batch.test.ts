import { v4 as uuid } from "uuid";

import { EventType } from "../types";
import { findUserEvents } from "../userEvents";
import { buildBatchUserEvents, submitBatch } from "./batch";

let testWorkspaceId: string;

describe("batch context merging", () => {
  beforeEach(() => {
    testWorkspaceId = uuid();
  });
  describe("buildBatchUserEvents", () => {
    it("should merge batch context with individual event context, with event context overriding", () => {
      const batchData = {
        context: {
          ip: "192.168.1.1",
          userAgent: "batch-agent",
          source: "batch",
        },
        batch: [
          {
            type: EventType.Track as const,
            event: "Test Event",
            userId: "user1",
            messageId: uuid(),
            properties: {
              test: "value",
            },
            context: {
              ip: "10.0.0.1", // Should override batch IP
              sessionId: "session123", // Should be added to merged context
            },
          },
          {
            type: EventType.Identify as const,
            userId: "user2",
            messageId: uuid(),
            traits: {
              email: "test@example.com",
            },
            context: {
              userAgent: "event-agent", // Should override batch userAgent
            },
          },
          {
            type: EventType.Track as const,
            event: "Another Event",
            userId: "user3",
            messageId: uuid(),
            properties: {
              another: "property",
            },
            // No individual context - should use batch context only
          },
        ],
      };

      const userEvents = buildBatchUserEvents(batchData);

      expect(userEvents).toHaveLength(3);

      // First event: context should be merged with event context overriding
      const firstEvent = userEvents[0];
      if (!firstEvent) {
        throw new Error("Expected first event to exist");
      }
      const firstMessageRaw = firstEvent.messageRaw;
      if (typeof firstMessageRaw === "string") {
        const firstEventRaw = JSON.parse(firstMessageRaw);
        expect(firstEventRaw.context).toEqual({
          ip: "10.0.0.1", // Overridden
          userAgent: "batch-agent", // From batch
          source: "batch", // From batch
          sessionId: "session123", // Added from event
        });
        expect(firstEventRaw.properties).toEqual({ test: "value" });
      } else {
        throw new Error("Expected messageRaw to be a string");
      }

      // Second event: context should be merged with event context overriding
      const secondEvent = userEvents[1];
      if (!secondEvent) {
        throw new Error("Expected second event to exist");
      }
      const secondMessageRaw = secondEvent.messageRaw;
      if (typeof secondMessageRaw === "string") {
        const secondEventRaw = JSON.parse(secondMessageRaw);
        expect(secondEventRaw.context).toEqual({
          ip: "192.168.1.1", // From batch (not overridden)
          userAgent: "event-agent", // Overridden
          source: "batch", // From batch
        });
        expect(secondEventRaw.traits).toEqual({ email: "test@example.com" });
      } else {
        throw new Error("Expected messageRaw to be a string");
      }

      // Third event: should use batch context only
      const thirdEvent = userEvents[2];
      if (!thirdEvent) {
        throw new Error("Expected third event to exist");
      }
      const thirdMessageRaw = thirdEvent.messageRaw;
      if (typeof thirdMessageRaw === "string") {
        const thirdEventRaw = JSON.parse(thirdMessageRaw);
        expect(thirdEventRaw.context).toEqual({
          ip: "192.168.1.1",
          userAgent: "batch-agent",
          source: "batch",
        });
        expect(thirdEventRaw.properties).toEqual({ another: "property" });
      } else {
        throw new Error("Expected messageRaw to be a string");
      }
    });

    it("should handle empty batch context", () => {
      const batchData = {
        batch: [
          {
            type: EventType.Track as const,
            event: "Test Event",
            userId: "user1",
            messageId: uuid(),
            context: {
              sessionId: "session123",
            },
          },
        ],
      };

      const userEvents = buildBatchUserEvents(batchData);
      const firstEvent = userEvents[0];
      if (!firstEvent) {
        throw new Error("Expected first event to exist");
      }
      const messageRaw = firstEvent.messageRaw;

      if (typeof messageRaw === "string") {
        const eventRaw = JSON.parse(messageRaw);
        expect(eventRaw.context).toEqual({
          sessionId: "session123",
        });
      } else {
        throw new Error("Expected messageRaw to be a string");
      }
    });

    it("should handle empty event context", () => {
      const batchData = {
        context: {
          ip: "192.168.1.1",
        },
        batch: [
          {
            type: EventType.Track as const,
            event: "Test Event",
            userId: "user1",
            messageId: uuid(),
          },
        ],
      };

      const userEvents = buildBatchUserEvents(batchData);
      const firstEvent = userEvents[0];
      if (!firstEvent) {
        throw new Error("Expected first event to exist");
      }
      const messageRaw = firstEvent.messageRaw;

      if (typeof messageRaw === "string") {
        const eventRaw = JSON.parse(messageRaw);
        expect(eventRaw.context).toEqual({
          ip: "192.168.1.1",
        });
      } else {
        throw new Error("Expected messageRaw to be a string");
      }
    });

    it("should handle both context being undefined", () => {
      const batchData = {
        batch: [
          {
            type: EventType.Track as const,
            event: "Test Event",
            userId: "user1",
            messageId: uuid(),
          },
        ],
      };

      const userEvents = buildBatchUserEvents(batchData);
      const firstEvent = userEvents[0];
      if (!firstEvent) {
        throw new Error("Expected first event to exist");
      }
      const messageRaw = firstEvent.messageRaw;

      if (typeof messageRaw === "string") {
        const eventRaw = JSON.parse(messageRaw);
        expect(eventRaw.context).toEqual({});
      } else {
        throw new Error("Expected messageRaw to be a string");
      }
    });
  });

  describe("submitBatch", () => {
    it("should submit events with merged context and be retrievable", async () => {
      const messageId1 = uuid();
      const messageId2 = uuid();

      const batchData = {
        context: {
          ip: "192.168.1.1",
          source: "test-batch",
        },
        batch: [
          {
            type: EventType.Track as const,
            event: "Context Test Event 1",
            userId: "test-user-1",
            messageId: messageId1,
            properties: {
              testProp: "value1",
            },
            context: {
              sessionId: "session-abc",
              ip: "10.0.0.1", // Should override batch IP
            },
          },
          {
            type: EventType.Track as const,
            event: "Context Test Event 2",
            userId: "test-user-2",
            messageId: messageId2,
            properties: {
              testProp: "value2",
            },
            // No individual context - should use batch context
          },
        ],
      };

      await submitBatch({
        workspaceId: testWorkspaceId,
        data: batchData,
      });

      // Retrieve the events to verify context was merged correctly
      const events = await findUserEvents({
        workspaceId: testWorkspaceId,
        messageId: [messageId1, messageId2],
        includeContext: true,
      });

      expect(events).toHaveLength(2);

      // Find events by message ID for reliable testing
      const event1 = events.find((e) => e.message_id === messageId1);
      const event2 = events.find((e) => e.message_id === messageId2);

      expect(event1).toBeDefined();
      expect(event2).toBeDefined();

      if (event1 && event1.context) {
        const context1 = JSON.parse(event1.context);
        expect(context1).toEqual({
          ip: "10.0.0.1", // Overridden value
          source: "test-batch", // From batch
          sessionId: "session-abc", // From event
        });
      }

      if (event2 && event2.context) {
        const context2 = JSON.parse(event2.context);
        expect(context2).toEqual({
          ip: "192.168.1.1", // From batch
          source: "test-batch", // From batch
        });
      }
    });
  });
});
