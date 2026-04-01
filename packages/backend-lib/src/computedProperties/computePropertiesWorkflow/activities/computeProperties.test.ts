import { randomUUID } from "crypto";

import { submitBatch } from "../../../apps/batch";
import { ClickHouseQueryBuilder, query as chQuery } from "../../../clickhouse";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { findAllSegmentAssignments, upsertSegment } from "../../../segments";
import {
  EventType,
  RandomBucketSegmentNode,
  SegmentNodeType,
  UserPropertyDefinitionType,
  Workspace,
  WorkspaceQueueItem,
  WorkspaceQueueItemType,
} from "../../../types";
import { computePropertiesIndividual } from "./computeProperties";

async function userPropertyAssignmentRowCount({
  workspaceId,
  userId,
  computedPropertyId,
}: {
  workspaceId: string;
  userId: string;
  computedPropertyId: string;
}): Promise<number> {
  const qb = new ClickHouseQueryBuilder();
  const result = await chQuery({
    query: `
      SELECT count() AS c
      FROM computed_property_assignments_v2
      WHERE
        workspace_id = ${qb.addQueryValue(workspaceId, "String")}
        AND user_id = ${qb.addQueryValue(userId, "String")}
        AND type = 'user_property'
        AND computed_property_id = ${qb.addQueryValue(computedPropertyId, "String")}
    `,
    query_params: qb.getQueries(),
  });
  const rows = await result.json<{ c: string }>();
  return Number(rows[0]?.c ?? 0);
}

describe("computeProperties activities", () => {
  let workspace: Workspace;
  beforeEach(async () => {
    const [w] = await db()
      .insert(schema.workspace)
      .values({
        name: randomUUID(),
        type: "Root",
        status: "Active",
      })
      .returning();
    if (!w) {
      throw new Error("Failed to create workspace");
    }
    workspace = w;
  });
  describe("computePropertiesIndividual", () => {
    beforeEach(async () => {
      await db()
        .insert(schema.userProperty)
        .values({
          workspaceId: workspace.id,
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        });
    });
    describe("when recomputing a random bucket segment", () => {
      let segmentId: string;
      beforeEach(async () => {
        segmentId = randomUUID();
        await upsertSegment({
          id: segmentId,
          name: "test",
          workspaceId: workspace.id,
          definition: {
            entryNode: {
              type: SegmentNodeType.RandomBucket,
              id: "1",
              percent: 100,
            } satisfies RandomBucketSegmentNode,
            nodes: [],
          },
        });
        await submitBatch({
          workspaceId: workspace.id,
          data: {
            batch: [
              {
                type: EventType.Identify,
                userId: "1",
                messageId: randomUUID(),
                traits: {
                  email: "test@test.com",
                },
              },
            ],
          },
        });
      });
      it("should compute the segment", async () => {
        const item: WorkspaceQueueItem = {
          type: WorkspaceQueueItemType.Segment,
          workspaceId: workspace.id,
          id: segmentId,
        };
        await computePropertiesIndividual({
          item,
          now: Date.now(),
        });
        const assignments = await findAllSegmentAssignments({
          workspaceId: workspace.id,
          userId: "1",
          segmentIds: [segmentId],
        });
        expect(assignments).toEqual({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          test: expect.any(Boolean),
        });
      });
    });
  });

  describe("alias reconcile and Id user property", () => {
    let userPropertyId: string;

    beforeEach(async () => {
      const [up] = await db()
        .insert(schema.userProperty)
        .values({
          workspaceId: workspace.id,
          name: `id-alias-${randomUUID()}`,
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        })
        .returning();
      if (!up) {
        throw new Error("Failed to insert user property");
      }
      userPropertyId = up.id;
    });

    it("drops anonymous assignment key after alias; canonical user_id gets assignment", async () => {
      const anonymousId = randomUUID();
      const knownUserId = randomUUID();

      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [
            {
              type: EventType.Identify,
              anonymousId,
              messageId: randomUUID(),
              traits: { email: "anon@test.com" },
            },
          ],
        },
      });

      const item: WorkspaceQueueItem = {
        type: WorkspaceQueueItemType.UserProperty,
        workspaceId: workspace.id,
        id: userPropertyId,
      };
      await computePropertiesIndividual({
        item,
        now: Date.now(),
      });

      expect(
        await userPropertyAssignmentRowCount({
          workspaceId: workspace.id,
          userId: anonymousId,
          computedPropertyId: userPropertyId,
        }),
      ).toBeGreaterThanOrEqual(1);
      expect(
        await userPropertyAssignmentRowCount({
          workspaceId: workspace.id,
          userId: knownUserId,
          computedPropertyId: userPropertyId,
        }),
      ).toBe(0);

      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [
            {
              type: EventType.Alias,
              userId: knownUserId,
              previousId: anonymousId,
              messageId: randomUUID(),
            },
          ],
        },
      });

      await computePropertiesIndividual({
        item,
        now: Date.now() + 1,
      });

      expect(
        await userPropertyAssignmentRowCount({
          workspaceId: workspace.id,
          userId: anonymousId,
          computedPropertyId: userPropertyId,
        }),
      ).toBe(0);
      expect(
        await userPropertyAssignmentRowCount({
          workspaceId: workspace.id,
          userId: knownUserId,
          computedPropertyId: userPropertyId,
        }),
      ).toBeGreaterThanOrEqual(1);
    });
  });
});
