import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { createPeriods } from "../computedProperties/periods";
import { insert } from "../db";
import { segment as dbSegment, workspace as dbWorkspace } from "../db/schema";
import { toSegmentResource } from "../segments";
import {
  ComputedPropertyStepEnum,
  SegmentNodeType,
  SegmentOperatorType,
} from "../types";
import { getManualSegmentStatus } from "./manualSegments";

describe("getManualSegmentStatus", () => {
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

  it("should return null when the segment does not exist", async () => {
    const status = await getManualSegmentStatus({
      workspaceId: workspace.id,
      segmentId: randomUUID(),
    });
    expect(status).toBeNull();
  });

  it("should return the latest ProcessAssignments period for the segment", async () => {
    const segment = unwrap(
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
    const now = Date.now();
    await createPeriods({
      workspaceId: workspace.id,
      segments: [unwrap(toSegmentResource(segment))],
      userProperties: [],
      now,
      step: ComputedPropertyStepEnum.ProcessAssignments,
    });

    const status = await getManualSegmentStatus({
      workspaceId: workspace.id,
      segmentId: segment.id,
    });
    expect(status).toEqual({ lastComputedAt: new Date(now).toISOString() });
  });
});
