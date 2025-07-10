import { randomUUID } from "crypto";

import { submitBatch } from "../../../apps/batch";
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
});
