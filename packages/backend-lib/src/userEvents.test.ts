import { Workspace } from "@prisma/client";
import { randomUUID } from "crypto";

import { segmentIdentifyEvent } from "../test/factories/segment";
import { submitBatch } from "./apps";
import config from "./config";
import prisma from "./prisma";
import { EventType, InternalEventType } from "./types";
import {
  findAllUserTraits,
  findManyEvents,
  submitBroadcast,
} from "./userEvents";
import {
  createUserEventsTables,
  insertUserEvents,
} from "./userEvents/clickhouse";

describe("userEvents", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = await prisma().workspace.create({
      data: { name: `workspace-${randomUUID()}` },
    });

    await Promise.all([
      createUserEventsTables({
        tableVersion: config().defaultUserEventsTableVersion,
      }),
      prisma().currentUserEventsTable.create({
        data: {
          workspaceId: workspace.id,
          version: config().defaultUserEventsTableVersion,
        },
      }),
    ]);
  });

  describe("findAllUserTraits", () => {
    beforeEach(async () => {
      await insertUserEvents({
        tableVersion: config().defaultUserEventsTableVersion,
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
      const userTraits = await findAllUserTraits({
        workspaceId: workspace.id,
        tableVersion: config().defaultUserEventsTableVersion,
      });
      userTraits.sort();
      expect(userTraits).toEqual(["height", "name", "status"]);
    });
  });

  describe("findManyEvents", () => {
    let messageId1: string;
    let messageId2: string;
    let messageId3: string;

    describe("with a date range", () => {
      beforeEach(async () => {
        messageId1 = randomUUID();
        messageId2 = randomUUID();
        messageId3 = randomUUID();

        await submitBatch({
          workspaceId: workspace.id,
          data: {
            batch: [
              {
                type: EventType.Identify,
                messageId: messageId1,
                userId: "user1",
                timestamp: "2023-01-05T00:00:00.000Z",
              },
              {
                type: EventType.Identify,
                messageId: messageId2,
                userId: "user1",
                timestamp: "2023-01-10T00:00:00.000Z",
              },
              {
                type: EventType.Identify,
                messageId: messageId3,
                userId: "user1",
                timestamp: "2023-01-15T00:00:00.000Z",
              },
            ],
          },
        });
      });

      it("returns events in the date range", async () => {
        const events = await findManyEvents({
          workspaceId: workspace.id,
          tableVersion: config().defaultUserEventsTableVersion,
          startDate: new Date("2023-01-08T00:00:00.000Z").getTime(),
          endDate: new Date("2023-01-12T00:00:00.000Z").getTime(),
        });
        expect(events.map((e) => e.message_id)).toEqual([messageId2]);
      });
    });
    describe("when identify events contain overlapping traits", () => {
      beforeEach(async () => {
        messageId1 = randomUUID();
        messageId2 = randomUUID();

        await insertUserEvents({
          tableVersion: config().defaultUserEventsTableVersion,
          workspaceId: workspace.id,
          events: [
            {
              messageId: messageId1,
              messageRaw: segmentIdentifyEvent({
                messageId1,
                timestamp: "2015-02-23T22:28:55.111Z",
                traits: {
                  status: "onboarding",
                  name: "max",
                },
              }),
            },
            {
              messageId: messageId2,
              messageRaw: segmentIdentifyEvent({
                timestamp: "2015-01-23T22:28:55.111Z",
                messageId: messageId2,
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
        const events = await findManyEvents({
          workspaceId: workspace.id,
          tableVersion: config().defaultUserEventsTableVersion,
        });
        if (!events[0] || !events[1]) {
          throw new Error("Too few events found.");
        }
        expect(new Date(events[0].event_time).getTime()).toBeGreaterThan(
          new Date(events[1].event_time).getTime()
        );
      });
    });
  });

  describe("submitBroadcast", () => {
    beforeEach(async () => {
      await insertUserEvents({
        tableVersion: config().defaultUserEventsTableVersion,
        workspaceId: workspace.id,
        events: [
          {
            messageId: randomUUID(),
            messageRaw: segmentIdentifyEvent({
              traits: {
                name: "chandler",
              },
            }),
          },
          {
            messageId: randomUUID(),
            messageRaw: segmentIdentifyEvent({
              traits: {
                name: "max",
              },
            }),
          },
        ],
      });
    });

    it("broadcasts to all users in in the workspace", async () => {
      const segmentId = randomUUID();
      const broadcastId = randomUUID();

      await submitBroadcast({
        segmentId,
        workspaceId: workspace.id,
        broadcastName: "my-broadcast",
        broadcastId,
      });

      const events = await findManyEvents({
        workspaceId: workspace.id,
      });
      expect(events).toHaveLength(4);
      const eventProperties = events.flatMap((e) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        if (e.event !== InternalEventType.SegmentBroadcast) {
          return [];
        }
        const properties = JSON.parse(e.properties);
        return properties;
      });
      const expectedBroadcastProperties = {
        segmentId,
        broadcastName: "my-broadcast",
        broadcastId,
      };
      expect(eventProperties).toEqual([
        expectedBroadcastProperties,
        expectedBroadcastProperties,
      ]);
    });
  });
});
