import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { db, insert } from "../db";
import { segment as dbSegment, workspace as dbWorkspace } from "../db/schema";
import { toSegmentResource } from "../segments";
import {
  ComputedPropertyStep,
  SavedSegmentResource,
  SegmentNodeType,
  SegmentOperatorType,
} from "../types";
import {
  createPeriods,
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

    beforeEach(async () => {
      const segment1 = unwrap(
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

      const segment2 = unwrap(
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

      date1 = Date.now();
      await createPeriods({
        workspaceId: workspace.id,
        segments: [unwrap(toSegmentResource(segment1))],
        userProperties: [],
        now: date1,
        step: ComputedPropertyStep.ComputeAssignments,
      });

      date2 = date1 + 1000 * 60 * 3;
      await createPeriods({
        workspaceId: workspace.id,
        segments: [unwrap(toSegmentResource(segment2))],
        userProperties: [],
        now: date2,
        step: ComputedPropertyStep.ComputeAssignments,
      });
    });

    it("should return the earliest computed property period", async () => {
      const period = await getEarliestComputePropertyPeriod({
        workspaceId: workspace.id,
      });
      expect(period).toEqual(date1);
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
        step: ComputedPropertyStep.ProcessAssignments,
      });
      let periodsById = await getPeriodsByComputedPropertyId({
        workspaceId: workspace.id,
        step: ComputedPropertyStep.ProcessAssignments,
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
        where: (table, { eq }) => eq(table.workspaceId, workspace.id),
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
        step: ComputedPropertyStep.ProcessAssignments,
      });

      periodsById = await getPeriodsByComputedPropertyId({
        workspaceId: workspace.id,
        step: ComputedPropertyStep.ProcessAssignments,
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
        where: (table, { eq }) => eq(table.workspaceId, workspace.id),
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
});
