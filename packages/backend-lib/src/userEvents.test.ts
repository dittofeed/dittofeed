import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { submitBatch } from "../test/testEvents";
import { segmentIdentifyEvent } from "./segmentIO";
import { EventType, Workspace } from "./types";
import {
  findIdentifyTraits,
  findManyEventsWithCount,
  insertUserEvents,
} from "./userEvents";
import { createWorkspace } from "./workspaces";

describe("userEvents", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = await createWorkspace({
      id: randomUUID(),
      name: `workspace-${randomUUID()}`,
      updatedAt: new Date(),
      createdAt: new Date(),
    }).then(unwrap);
  });

  describe("findAllUserTraits", () => {
    beforeEach(async () => {
      await insertUserEvents({
        workspaceId: workspace.id,
        events: [
          {
            messageId: randomUUID(),
            messageRaw: segmentIdentifyEvent({
              traits: {
                status: "onboarding",
                name: "max",
              },
            }),
          },
          {
            messageId: randomUUID(),
            messageRaw: segmentIdentifyEvent({
              traits: {
                status: "onboarding",
                height: "73",
              },
            }),
          },
        ],
      });
    });

    it("returns the relevant traits without duplicates", async () => {
      const userTraits = await findIdentifyTraits({
        workspaceId: workspace.id,
      });
      userTraits.sort();
      expect(userTraits).toEqual(["height", "name", "status"]);
    });
  });

  describe("findManyEventsWithCount", () => {
    let messageId1: string;
    let messageId2: string;
    let messageId3: string;

    beforeEach(async () => {
      messageId1 = randomUUID();
      messageId2 = randomUUID();
      messageId3 = randomUUID();
      const now = new Date("2023-01-01T00:00:00.000Z").getTime();

      await submitBatch({
        workspaceId: workspace.id,
        now,
        data: [
          {
            type: EventType.Identify,
            messageId: messageId1,
            userId: "user1",
            offsetMs: 4 * 24 * 60 * 60 * 1000,
          },
          {
            type: EventType.Identify,
            messageId: messageId2,
            userId: "user1",
            offsetMs: 9 * 24 * 60 * 60 * 1000,
          },
          {
            type: EventType.Identify,
            messageId: messageId3,
            userId: "user1",
            offsetMs: 14 * 24 * 60 * 60 * 1000,
          },
        ],
      });
    });

    describe("with a date range", () => {
      it("returns events in the date range", async () => {
        const { events } = await findManyEventsWithCount({
          workspaceId: workspace.id,
          startDate: new Date("2023-01-08T00:00:00.000Z").getTime(),
          endDate: new Date("2023-01-12T00:00:00.000Z").getTime(),
        });
        expect(events.map((e) => e.message_id)).toEqual([messageId2]);
      });
    });

    it("returns events sorted by processing date", async () => {
      const { events } = await findManyEventsWithCount({
        workspaceId: workspace.id,
      });
      const processingTimes = events.map((e) =>
        new Date(e.processing_time).getTime(),
      );
      expect(processingTimes).not.toHaveLength(0);

      const expected = [...processingTimes];
      expected.sort();
      expected.reverse();

      expect(processingTimes).toEqual(expected);
    });

    describe("with includeContext parameter", () => {
      beforeEach(async () => {
        // Insert events with context data
        await insertUserEvents({
          workspaceId: workspace.id,
          events: [
            {
              messageId: randomUUID(),
              messageRaw: JSON.stringify({
                type: "track",
                event: "Test Event",
                userId: "user-with-context",
                context: {
                  page: {
                    path: "/dashboard",
                    title: "Dashboard",
                  },
                  userAgent: "Mozilla/5.0",
                },
                properties: {
                  category: "engagement",
                },
                timestamp: new Date().toISOString(),
              }),
            },
            {
              messageId: randomUUID(),
              messageRaw: JSON.stringify({
                type: "identify",
                userId: "user-without-context",
                traits: {
                  email: "test@example.com",
                },
                timestamp: new Date().toISOString(),
              }),
            },
          ],
        });
      });

      it("includes context field when includeContext is true", async () => {
        const { events } = await findManyEventsWithCount({
          workspaceId: workspace.id,
          includeContext: true,
        });

        const eventWithContext = events.find(
          (e) => e.user_id === "user-with-context",
        );
        const eventWithoutContext = events.find(
          (e) => e.user_id === "user-without-context",
        );

        expect(eventWithContext).toBeDefined();
        expect(eventWithoutContext).toBeDefined();

        // Check that context field exists in response when includeContext is true
        expect("context" in eventWithContext!).toBe(true);
        expect("context" in eventWithoutContext!).toBe(true);

        // Verify context content for event that has context
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const contextData = eventWithContext?.context
          ? JSON.parse(eventWithContext.context)
          : null;
        expect(contextData).toEqual({
          page: {
            path: "/dashboard",
            title: "Dashboard",
          },
          userAgent: "Mozilla/5.0",
        });

        // Verify context is empty string for event without context (ClickHouse JSONExtractString behavior)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect(eventWithoutContext?.context).toBe("");
      });

      it("excludes context field when includeContext is false", async () => {
        const { events } = await findManyEventsWithCount({
          workspaceId: workspace.id,
          includeContext: false,
        });

        const eventWithContext = events.find(
          (e) => e.user_id === "user-with-context",
        );

        expect(eventWithContext).toBeDefined();
        expect("context" in eventWithContext!).toBe(false);
      });

      it("excludes context field when includeContext is undefined", async () => {
        const { events } = await findManyEventsWithCount({
          workspaceId: workspace.id,
        });

        const eventWithContext = events.find(
          (e) => e.user_id === "user-with-context",
        );

        expect(eventWithContext).toBeDefined();
        expect("context" in eventWithContext!).toBe(false);
      });
    });
  });
});
