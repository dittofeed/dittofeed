import {
  RelationalOperators,
  SavedSegmentResource,
  SegmentNodeType,
  SegmentStatusEnum,
} from "../types";
import { computeDelayedReevaluationBoundaries } from "./delayed";
import { RealtimeUserState } from "./state";

function segment(
  definition: SavedSegmentResource["definition"],
): SavedSegmentResource {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Timed segment",
    workspaceId: "00000000-0000-0000-0000-000000000002",
    definition,
    createdAt: 0,
    updatedAt: 0,
    definitionUpdatedAt: 0,
    status: SegmentStatusEnum.Running,
  };
}

describe("computeDelayedReevaluationBoundaries", () => {
  it("schedules deduped entry and exit boundaries for 10-12 minute windows", () => {
    const openedAt = new Date("2026-01-01T00:00:00.000Z");
    const state: RealtimeUserState = {
      userOrAnonymousId: "user-1",
      traits: {},
      trackEvents: [
        {
          event: "THIRD_STEP_DEPOSIT_OPENED",
          properties: {},
          eventTime: openedAt,
        },
      ],
    };
    const boundaries = computeDelayedReevaluationBoundaries({
      segments: [
        segment({
          entryNode: {
            type: SegmentNodeType.And,
            id: "and",
            children: ["opened-within-12", "not-opened-within-10"],
          },
          nodes: [
            {
              type: SegmentNodeType.Performed,
              id: "opened-within-12",
              event: "THIRD_STEP_DEPOSIT_OPENED",
              times: 1,
              timesOperator: RelationalOperators.GreaterThanOrEqual,
              withinSeconds: 720,
            },
            {
              type: SegmentNodeType.Performed,
              id: "not-opened-within-10",
              event: "THIRD_STEP_DEPOSIT_OPENED",
              times: 1,
              timesOperator: RelationalOperators.LessThan,
              withinSeconds: 600,
            },
          ],
        }),
      ],
      state,
      now: new Date(openedAt.getTime() + 60_000),
    });

    expect(boundaries.map((b) => b.availableAt.toISOString()).sort()).toEqual([
      "2026-01-01T00:10:00.000Z",
      "2026-01-01T00:12:00.000Z",
    ]);
  });

  it("schedules boundaries for exact within-window counts", () => {
    const firstCheckinAt = new Date("2026-01-01T00:00:00.000Z");
    const secondCheckinAt = new Date("2026-01-02T00:00:00.000Z");
    const state: RealtimeUserState = {
      userOrAnonymousId: "user-1",
      traits: {},
      trackEvents: [
        {
          event: "CHECKIN_COMPLETED",
          properties: {},
          eventTime: secondCheckinAt,
        },
        {
          event: "CHECKIN_COMPLETED",
          properties: {},
          eventTime: firstCheckinAt,
        },
      ],
    };
    const boundaries = computeDelayedReevaluationBoundaries({
      segments: [
        segment({
          entryNode: {
            type: SegmentNodeType.Performed,
            id: "exactly-one-checkin",
            event: "CHECKIN_COMPLETED",
            times: 1,
            timesOperator: RelationalOperators.Equals,
            withinSeconds: 172800,
          },
          nodes: [],
        }),
      ],
      state,
      now: new Date("2026-01-02T01:00:00.000Z"),
    });

    expect(boundaries.map((b) => b.availableAt.toISOString()).sort()).toEqual([
      "2026-01-03T00:00:00.000Z",
      "2026-01-04T00:00:00.000Z",
    ]);
  });
});
