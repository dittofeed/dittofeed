import NodeCache from "node-cache";
import { v4 as uuidv4 } from "uuid";

import { submitBatch } from "./apps/batch";
import { db } from "./db";
import { journey as dbJourney } from "./db/schema";
import { triggerEventEntryJourneysFactory } from "./journeys";
import {
  EventType,
  JourneyDefinition,
  JourneyInsert,
  JourneyNodeType,
} from "./types";
import { findManyEventsWithCount } from "./userEvents";
import { createWorkspace } from "./workspaces";

describe("apps", () => {
  let workspaceId: string;

  beforeEach(async () => {
    workspaceId = uuidv4();
    await createWorkspace({
      id: workspaceId,
      name: `test-${workspaceId}`,
      updatedAt: new Date().toISOString(),
    });
  });

  describe("submitBatch", () => {
    describe("when events don't have traits or properties", () => {
      it("should default traits or properties to empty object", async () => {
        await submitBatch({
          workspaceId,
          data: {
            batch: [
              {
                type: EventType.Identify,
                messageId: uuidv4(),
                userId: uuidv4(),
              },
              {
                type: EventType.Track,
                event: "Purchase",
                messageId: uuidv4(),
                userId: uuidv4(),
              },
            ],
          },
        });
        const { events } = await findManyEventsWithCount({
          workspaceId,
        });
        expect(events.map((er) => er.properties || er.traits)).toEqual([
          "{}",
          "{}",
        ]);
      });
    });
  });
  describe("submitBatchWithTriggers", () => {
    let startKeyedJourneyImpl: jest.Mock;
    let notStartedJourneyId: string;
    let startedEventTriggeredJourneyId: string;
    let segmentEntryJourneyId: string;
    let entryEventName: string;
    let submitBatchWithTriggers: typeof import("./apps").submitBatchWithTriggers;

    beforeEach(async () => {
      entryEventName = "Purchase";
      const eventTriggeredJourneyDefinition: JourneyDefinition = {
        entryNode: {
          type: JourneyNodeType.EventEntryNode,
          event: entryEventName,
          child: JourneyNodeType.ExitNode,
          key: "itemId",
        },
        nodes: [],
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
      };
      const segmentEntryJourneyDefinition: JourneyDefinition = {
        entryNode: {
          type: JourneyNodeType.SegmentEntryNode,
          segment: "test-segment",
          child: JourneyNodeType.ExitNode,
        },
        nodes: [],
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
      };
      segmentEntryJourneyId = uuidv4();
      notStartedJourneyId = uuidv4();
      startedEventTriggeredJourneyId = uuidv4();

      await db()
        .insert(dbJourney)
        .values([
          {
            id: notStartedJourneyId,
            name: "not started",
            status: "NotStarted",
            workspaceId,
            definition: eventTriggeredJourneyDefinition,
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          } satisfies JourneyInsert,
          {
            id: startedEventTriggeredJourneyId,
            name: "started event triggered",
            status: "Running",
            workspaceId,
            definition: eventTriggeredJourneyDefinition,
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
          {
            id: segmentEntryJourneyId,
            name: "segment entry",
            status: "Running",
            workspaceId,
            definition: segmentEntryJourneyDefinition,
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        ]);

      startKeyedJourneyImpl = jest.fn();

      // Custom implementation
      jest.mock("./journeys", () => ({
        triggerEventEntryJourneys: triggerEventEntryJourneysFactory({
          journeyCache: new NodeCache(),
          startKeyedJourneyImpl,
        }),
      }));
      const apps = await import("./apps");
      submitBatchWithTriggers = apps.submitBatchWithTriggers;
    });

    it("it should trigger journeys for users with matching events", async () => {
      const userId1 = uuidv4();
      const userId2 = uuidv4();

      await submitBatchWithTriggers({
        workspaceId,
        data: {
          batch: [
            {
              type: EventType.Track,
              event: entryEventName,
              messageId: uuidv4(),
              userId: userId1,
              properties: { amount: 100, itemId: "123" },
            },
            {
              type: EventType.Track,
              event: "missing-event",
              messageId: uuidv4(),
              userId: userId1,
            },
            {
              type: EventType.Identify,
              messageId: uuidv4(),
              userId: userId2,
              traits: { name: "Test User" },
            },
          ],
        },
      });
      expect(startKeyedJourneyImpl).toHaveBeenCalledTimes(1);
      expect(startKeyedJourneyImpl).toHaveBeenCalledWith(
        expect.objectContaining({
          journeyId: startedEventTriggeredJourneyId,
          userId: userId1,
        }),
      );
    });
  });
});
