import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import prisma from "../prisma";
import { toSegmentResource } from "../segments";
import {
  ComputedPropertyStep,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
} from "../types";
import { createPeriods, getEarliestComputePropertyPeriod } from "./periods";

describe("periods", () => {
  describe("getEarliestComputePropertyPeriod", () => {
    let workspaceId: string;
    let date1: number;
    let date2: number;

    beforeEach(async () => {
      const workspace = await prisma().workspace.create({
        data: {
          name: `workspace-${randomUUID()}`,
        },
      });
      workspaceId = workspace.id;
      const segment1 = await prisma().segment.create({
        data: {
          workspaceId,
          name: `segment-${randomUUID()}`,
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
          } satisfies SegmentDefinition,
        },
      });
      const segment2 = await prisma().segment.create({
        data: {
          workspaceId,
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
          } satisfies SegmentDefinition,
        },
      });
      date1 = Date.now();
      await createPeriods({
        workspaceId,
        segments: [unwrap(toSegmentResource(segment1))],
        userProperties: [],
        now: date1,
        step: ComputedPropertyStep.ProcessAssignments,
      });

      date2 = date1 + 1000 * 60 * 3;
      await createPeriods({
        workspaceId,
        segments: [unwrap(toSegmentResource(segment2))],
        userProperties: [],
        now: date2,
        step: ComputedPropertyStep.ProcessAssignments,
      });
    });

    it("should return the earliest computed property period", async () => {
      const period = await getEarliestComputePropertyPeriod({ workspaceId });
      expect(period).toEqual(date1);
    });
  });
});
