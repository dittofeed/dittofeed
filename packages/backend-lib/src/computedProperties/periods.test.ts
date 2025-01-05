import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { insert } from "../db";
import { segment as dbSegment, workspace as dbWorkspace } from "../db/schema";
import { toSegmentResource } from "../segments";
import {
  ComputedPropertyStep,
  SegmentNodeType,
  SegmentOperatorType,
} from "../types";
import { createPeriods, getEarliestComputePropertyPeriod } from "./periods";

describe("periods", () => {
  let workspace: typeof dbWorkspace.$inferSelect;

  describe("getEarliestComputePropertyPeriod", () => {
    let date1: number;
    let date2: number;

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
        step: ComputedPropertyStep.ProcessAssignments,
      });

      date2 = date1 + 1000 * 60 * 3;
      await createPeriods({
        workspaceId: workspace.id,
        segments: [unwrap(toSegmentResource(segment2))],
        userProperties: [],
        now: date2,
        step: ComputedPropertyStep.ProcessAssignments,
      });
    });

    it("should return the earliest computed property period", async () => {
      const period = await getEarliestComputePropertyPeriod({
        workspaceId: workspace.id,
      });
      expect(period).toEqual(date1);
    });
  });

  // describe("getPeriodsByComputedPropertyId", () => {
  //   it("should return the latest computed property period", async () => {
  //     const period = await getPeriodsByComputedPropertyId({
  //       workspaceId: ,
  //       step: ComputedPropertyStep.ProcessAssignments,
  //     });
  //     expect(period).toEqual(date2);
  //   });
  // });
});
