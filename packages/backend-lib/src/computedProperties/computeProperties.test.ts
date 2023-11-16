import { randomUUID } from "crypto";

import { submitBatch } from "../apps";
import { clickhouseClient, ClickHouseQueryBuilder } from "../clickhouse";
import prisma from "../prisma";
import {
  EventType,
  SavedUserPropertyResource,
  UserPropertyDefinitionType,
} from "../types";
import {
  computeAssignments,
  ComputedPropertyAssignment,
  computeState,
  createTables,
  dropTables,
} from "./computeProperties";

async function readAssignments({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<ComputedPropertyAssignment[]> {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select *
    from computed_property_assignments_v2
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
  `;
  const response = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
  });
  const values: { data: ComputedPropertyAssignment[] } = await response.json();
  return values.data;
}

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
      const now = Date.now();
      const userPropertyResource: SavedUserPropertyResource = {
        id: randomUUID(),
        name: "email",
        workspaceId,
        definition: {
          type: UserPropertyDefinitionType.Trait,
          path: "email",
        },
        createdAt: now,
        updatedAt: now,
        definitionUpdatedAt: now,
      };

      console.log("computing state");
      await computeState({
        workspaceId,
        segments: [],
        now,
        userProperties: [userPropertyResource],
      });
      console.log("computing assignments");
      await computeAssignments({
        workspaceId,
        segments: [],
        userProperties: [userPropertyResource],
      });
    });

    it("produces the correct intermediate states", async () => {
      console.log("reading assignments");
      const assignments = await readAssignments({
        workspaceId,
      });
      expect(assignments.map((up) => up.user_property_value)).toEqual([
        "test@email.com",
      ]);
    });
  });
});
