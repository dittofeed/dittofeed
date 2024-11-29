import NodeCache from "node-cache";
import { v4 as uuidv4 } from "uuid";

import { submitBatchWithTriggers } from "./apps";
import { submitBatch } from "./apps/batch";
import { triggerEventEntryJourneysFactory } from "./journeys";
import prisma from "./prisma";
import {
  EventType,
  JourneyDefinition,
  JourneyNodeType,
  JourneyStatus,
} from "./types";
import { findManyEventsWithCount } from "./userEvents";

describe("apps", () => {
  describe("submitBatch", () => {
    describe("when events don't have traits or properties", () => {
      it("should default traits or properties to empty object", async () => {
        const workspaceId = uuidv4();

        await prisma().workspace.create({
          data: {
            id: workspaceId,
            name: `test-${workspaceId}`,
          },
        });

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
    let workspaceId: string;
    let startKeyedJourneyImpl: jest.Mock;
    let notStartedJourneyId: string;
    let startedEventTriggeredJourneyId: string;
    let segmentEntryJourneyId: string;
    let entryEventName: string;

    beforeEach(async () => {
      workspaceId = uuidv4();
      await prisma().workspace.create({
        data: { id: workspaceId, name: `test-${workspaceId}` },
      });
      entryEventName = "Purchase";
      const eventTriggeredJourneyDefinition: JourneyDefinition = {
        entryNode: {
          type: JourneyNodeType.EventEntryNode,
          event: entryEventName,
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

      await Promise.all([
        prisma().journey.create({
          data: {
            id: notStartedJourneyId,
            name: "not started",
            status: JourneyStatus.NotStarted,
            workspaceId,
            definition: eventTriggeredJourneyDefinition,
          },
        }),
        prisma().journey.create({
          data: {
            id: startedEventTriggeredJourneyId,
            name: "started event triggered",
            status: JourneyStatus.Running,
            workspaceId,
            definition: eventTriggeredJourneyDefinition,
          },
        }),
        prisma().journey.create({
          data: {
            id: segmentEntryJourneyId,
            name: "segment entry",
            status: JourneyStatus.Running,
            workspaceId,
            definition: eventTriggeredJourneyDefinition,
          },
        }),
      ]);

      startKeyedJourneyImpl = jest.fn();

      // Custom implementation
      jest.mock("./journeys", () => {
        return triggerEventEntryJourneysFactory({
          journeyCache: new NodeCache(),
          startKeyedJourneyImpl,
        });
      });
    });

    afterEach(() => {
      jest.resetModules();
    });

    it.only("it should trigger journeys for users with matching events", async () => {
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
              properties: { amount: 100 },
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
      expect(startKeyedJourneyImpl).toHaveBeenCalledWith({
        journeyId: startedEventTriggeredJourneyId,
        userId: userId1,
      });
    });
  });
});
