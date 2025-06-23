import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { db, insert } from "../db";
import { segment as dbSegment, workspace as dbWorkspace } from "../db/schema";
import logger from "../logger";
import { toSegmentResource } from "../segments";
import {
  ComputedPropertyStepEnum,
  SavedSegmentResource,
  SegmentNodeType,
  SegmentOperatorType,
} from "../types";
import {
  createPeriods,
  findDueWorkspaceMinTos,
  getEarliestComputePropertyPeriod,
  getPeriodsByComputedPropertyId,
} from "./periods";

describe("periods", () => {
  let workspace: typeof dbWorkspace.$inferSelect;
  beforeEach(async () => {
    workspace = unwrap(
      await insert({
        table: dbWorkspace,
        values: {
          id: randomUUID(),
          name: `workspace-${randomUUID()}`,
          updatedAt: new Date(),
        },
      }),
    );
  });

  describe("getEarliestComputePropertyPeriod", () => {
    let date1: number;
    let date2: number;
    let segment1: SavedSegmentResource;
    let segment2: SavedSegmentResource;

    beforeEach(async () => {
      const segment1Db = unwrap(
        await insert({
          table: dbSegment,
          values: {
            workspaceId: workspace.id,
            name: `segment-${randomUUID()}`,
            id: randomUUID(),
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Trait,
                path: "email",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "example@test.com",
                },
              },
              nodes: [],
            },
            updatedAt: new Date(),
          },
        }),
      );
      segment1 = unwrap(toSegmentResource(segment1Db));

      const segment2Db = unwrap(
        await insert({
          table: dbSegment,
          values: {
            id: randomUUID(),
            workspaceId: workspace.id,
            name: `segment-${randomUUID()}`,
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Trait,
                path: "name",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "max",
                },
              },
              nodes: [],
            },
            updatedAt: new Date(),
          },
        }),
      );
      segment2 = unwrap(toSegmentResource(segment2Db));

      date1 = Date.now();
      await createPeriods({
        workspaceId: workspace.id,
        segments: [segment1],
        userProperties: [],
        now: date1,
        step: ComputedPropertyStepEnum.ComputeAssignments,
      });

      date2 = date1 + 1000 * 60 * 3;
      await createPeriods({
        workspaceId: workspace.id,
        segments: [segment2],
        userProperties: [],
        now: date2,
        step: ComputedPropertyStepEnum.ComputeAssignments,
      });
    });

    it("should return the earliest computed property period", async () => {
      const period = await getEarliestComputePropertyPeriod({
        workspaceId: workspace.id,
      });
      expect(period).toEqual(date1);
    });

    describe("when a segment is paused", () => {
      beforeEach(async () => {
        await db()
          .update(dbSegment)
          .set({ status: "Paused" })
          .where(eq(dbSegment.id, segment1.id));
      });

      it("should only return periods from running properties", async () => {
        const period = await getEarliestComputePropertyPeriod({
          workspaceId: workspace.id,
        });
        expect(period).toEqual(date2);
      });
    });
  });

  describe("getPeriodsByComputedPropertyId", () => {
    it("should return the latest computed property period", async () => {
      let now = Date.now();
      const segment: SavedSegmentResource = {
        id: randomUUID(),
        name: `segment-${randomUUID()}`,
        workspaceId: workspace.id,
        definition: {
          entryNode: {
            id: "1",
            type: SegmentNodeType.Trait,
            path: "email",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "example@test.com",
            },
          },
          nodes: [],
        },
        createdAt: now,
        updatedAt: now,
        definitionUpdatedAt: now,
      };

      await createPeriods({
        workspaceId: workspace.id,
        segments: [segment],
        userProperties: [],
        now,
        step: ComputedPropertyStepEnum.ProcessAssignments,
      });
      let periodsById = await getPeriodsByComputedPropertyId({
        workspaceId: workspace.id,
        step: ComputedPropertyStepEnum.ProcessAssignments,
      });
      expect(
        periodsById.get({
          computedPropertyId: segment.id,
          version: segment.definitionUpdatedAt.toString(),
        }),
      ).toEqual(
        expect.objectContaining({
          maxTo: new Date(now),
        }),
      );
      let periods = await db().query.computedPropertyPeriod.findMany({
        where: (table, { eq: eqOp }) => eqOp(table.workspaceId, workspace.id),
        orderBy: (table, { asc }) => [asc(table.createdAt)],
      });
      expect(periods).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            from: null,
            to: new Date(now),
          }),
        ]),
      );

      const nowPrior = now;
      now += 1000 * 60 * 3;

      await createPeriods({
        workspaceId: workspace.id,
        segments: [segment],
        userProperties: [],
        now,
        periodByComputedPropertyId: periodsById,
        step: ComputedPropertyStepEnum.ProcessAssignments,
      });

      periodsById = await getPeriodsByComputedPropertyId({
        workspaceId: workspace.id,
        step: ComputedPropertyStepEnum.ProcessAssignments,
      });
      expect(
        periodsById.get({
          computedPropertyId: segment.id,
          version: segment.definitionUpdatedAt.toString(),
        }),
      ).toEqual(
        expect.objectContaining({
          maxTo: new Date(now),
        }),
      );

      periods = await db().query.computedPropertyPeriod.findMany({
        where: (table, { eq: eqOp }) => eqOp(table.workspaceId, workspace.id),
        orderBy: (table, { asc }) => [asc(table.createdAt)],
      });

      expect(periods).toEqual([
        expect.objectContaining({
          from: null,
          to: new Date(nowPrior),
        }),
        expect.objectContaining({
          from: new Date(nowPrior),
          to: new Date(now),
        }),
      ]);
    });
  });

  describe("findDueWorkspaceMinTos", () => {
    let segment1: SavedSegmentResource;
    let segment2: SavedSegmentResource;
    let now: number;

    beforeEach(async () => {
      now = Date.now();
      const segment1Db = unwrap(
        await insert({
          table: dbSegment,
          values: {
            workspaceId: workspace.id,
            name: `segment1-${randomUUID()}`,
            id: randomUUID(),
            status: "Running",
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Trait,
                path: "email",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "example@test.com",
                },
              },
              nodes: [],
            },
            updatedAt: new Date(),
          },
        }),
      );
      segment1 = unwrap(toSegmentResource(segment1Db));

      const segment2Db = unwrap(
        await insert({
          table: dbSegment,
          values: {
            workspaceId: workspace.id,
            name: `segment2-${randomUUID()}`,
            id: randomUUID(),
            status: "Running",
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Trait,
                path: "name",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "max",
                },
              },
              nodes: [],
            },
            updatedAt: new Date(),
          },
        }),
      );
      segment2 = unwrap(toSegmentResource(segment2Db));
    });

    it("should return workspaces with properties that are due", async () => {
      const interval = 1000 * 60; // 1 minute
      const dueTime = now - interval * 2;
      const recentTime = now - interval / 2;

      // segment1 is due
      await createPeriods({
        workspaceId: workspace.id,
        segments: [segment1],
        userProperties: [],
        now: dueTime,
        step: ComputedPropertyStepEnum.ComputeAssignments,
      });

      // segment2 is not due
      await createPeriods({
        workspaceId: workspace.id,
        segments: [segment2],
        userProperties: [],
        now: recentTime,
        step: ComputedPropertyStepEnum.ComputeAssignments,
      });

      const dueWorkspaces = await findDueWorkspaceMinTos({
        now,
        interval,
      });

      logger().info({ dueWorkspaces }, "dueWorkspaces");
      const dueWorkspace = dueWorkspaces.find(
        (w) => w.workspaceId === workspace.id,
      );
      expect(dueWorkspace).toBeDefined();
      expect(dueWorkspace?.min?.getTime()).toBeCloseTo(dueTime);
    });

    it("should return workspaces with properties that have never been computed (cold start)", async () => {
      const interval = 1000 * 60; // 1 minute

      // segment1 has no period records, so it's a cold start

      const dueWorkspaces = await findDueWorkspaceMinTos({
        now,
        interval,
      });

      const dueWorkspace = dueWorkspaces.find(
        (w) => w.workspaceId === workspace.id,
      );
      expect(dueWorkspace).toBeDefined();
      expect(dueWorkspace?.min).toBeNull();
    });

    it("should not return workspaces with non-running properties", async () => {
      await db()
        .update(dbSegment)
        .set({ status: "NotStarted" })
        .where(eq(dbSegment.id, segment1.id));

      const interval = 1000 * 60; // 1 minute

      const dueWorkspaces = await findDueWorkspaceMinTos({
        now,
        interval,
      });

      const dueWorkspace = dueWorkspaces.find(
        (w) => w.workspaceId === workspace.id,
      );
      expect(dueWorkspace).toBeUndefined();
    });
  });
});
