import { v4 as uuidv4 } from "uuid";

import { submitBatch } from "./apps";
import config from "./config";
import prisma from "./prisma";
import { EventType } from "./types";
import { findManyEvents } from "./userEvents";

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

        await prisma().currentUserEventsTable.create({
          data: {
            workspaceId,
            version: config().defaultUserEventsTableVersion,
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
        const eventsRaw = await findManyEvents({
          workspaceId,
        });
        expect(eventsRaw.map((er) => er.properties || er.traits)).toEqual([
          "{}",
          "{}",
        ]);
      });
    });
  });
});
