import { v4 as uuidv4 } from "uuid";

import { submitBatch } from "./apps/batch";
import prisma from "./prisma";
import { EventType } from "./types";
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
});
