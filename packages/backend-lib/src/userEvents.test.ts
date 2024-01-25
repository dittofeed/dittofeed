import { Workspace } from "@prisma/client";
import { randomUUID } from "crypto";

import { submitBatch } from "./apps";
import prisma from "./prisma";
import { segmentIdentifyEvent } from "./segmentIO";
import { EventType } from "./types";
import {
  findIdentifyTraits,
  findManyEvents,
  insertUserEvents,
} from "./userEvents";

describe("userEvents", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = await prisma().workspace.create({
      data: { name: `workspace-${randomUUID()}` },
    });
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
        });
        if (!events[0] || !events[1]) {
          throw new Error("Too few events found.");
        }
        expect(new Date(events[0].event_time).getTime()).toBeGreaterThan(
          new Date(events[1].event_time).getTime(),
        );
      });
    });
  });
});
