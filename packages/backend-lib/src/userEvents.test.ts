import { Workspace } from "@prisma/client";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { submitBatch } from "../test/testEvents";
import { segmentIdentifyEvent } from "./segmentIO";
import { EventType } from "./types";
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
  });
});
