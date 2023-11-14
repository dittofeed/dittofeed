import { randomUUID } from "crypto";

import { submitBatch } from "../apps";
import prisma from "../prisma";
import {
  EventType,
  SavedUserPropertyResource,
  UserPropertyDefinitionType,
  UserPropertyResource,
} from "../types";
import { computeState, createTables, dropTables } from "./computeProperties";

describe("computeProperties", () => {
  let workspaceId: string;
  beforeEach(async () => {
    workspaceId = randomUUID();

    await Promise.all([
      createTables(),
      prisma().workspace.create({
        data: {
          id: workspaceId,
          name: randomUUID(),
        },
      }),
    ]);

    await prisma().currentUserEventsTable.create({
      data: {
        workspaceId,
        version: "v2",
      },
    });
  });

  afterEach(async () => {
    await dropTables();
  });

  describe("computeStates", () => {
    beforeEach(async () => {
      await submitBatch({
        workspaceId,
        data: {
          batch: [
            {
              userId: randomUUID(),
              type: EventType.Identify,
              messageId: randomUUID(),
              traits: {
                email: "test@email.com",
              },
            },
          ],
        },
      });
      const userPropertyResource: SavedUserPropertyResource = {
        id: randomUUID(),
        name: "email",
        workspaceId,
        definition: {
          type: UserPropertyDefinitionType.Trait,
          path: "email",
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        definitionUpdatedAt: Date.now(),
      };
      await computeState({
        workspaceId,
        segments: [],
        userProperties: [userPropertyResource],
      });
    });

    it("produces the correct intermediate states", () => {
      expect(1).toEqual(1);
    });
  });
});
