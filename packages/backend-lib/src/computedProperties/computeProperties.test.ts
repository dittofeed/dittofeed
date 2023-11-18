import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { submitBatch } from "../apps";
import { clickhouseClient, ClickHouseQueryBuilder } from "../clickhouse";
import prisma from "../prisma";
import {
  ComputedPropertyAssignment,
  EventType,
  SavedUserPropertyResource,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
} from "../types";
import {
  findAllUserPropertyAssignments,
  toUserPropertyResource,
} from "../userProperties";
import {
  computeAssignments,
  computeState,
  createTables,
  dropTables,
  processAssignments,
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
    let userId: string;
    beforeEach(async () => {
      userId = "user-1";

      await submitBatch({
        workspaceId,
        data: {
          batch: [
            {
              userId,
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
      const userPropertyDefinition: UserPropertyDefinition = {
        type: UserPropertyDefinitionType.Trait,
        path: "email",
      };
      const userPropertyResource: SavedUserPropertyResource = unwrap(
        toUserPropertyResource(
          await prisma().userProperty.create({
            data: {
              workspaceId,
              name: "email",
              definition: userPropertyDefinition,
            },
          })
        )
      );

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
      await processAssignments({
        workspaceId,
        segments: [],
        integrations: [],
        journeys: [],
        userProperties: [userPropertyResource],
      });
    });

    it("produces the correct intermediate states", async () => {
      const chAssignments = await readAssignments({
        workspaceId,
      });
      const pgAssignments = await findAllUserPropertyAssignments({
        userId,
        workspaceId,
      });
      expect(chAssignments.map((up) => up.user_property_value)).toEqual([
        '"test@email.com"',
      ]);
      expect(pgAssignments.email).toEqual("test@email.com");
    });
  });
});
