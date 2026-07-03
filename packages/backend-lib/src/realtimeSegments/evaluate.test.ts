import {
  RelationalOperators,
  SavedSegmentResource,
  SegmentHasBeenOperatorComparator,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentStatusEnum,
} from "../types";
import { evaluateRealtimeSegment } from "./evaluate";
import { RealtimeUserState } from "./state";

function segment(
  definition: SavedSegmentResource["definition"],
): SavedSegmentResource {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Test segment",
    workspaceId: "00000000-0000-0000-0000-000000000002",
    definition,
    createdAt: 0,
    updatedAt: 0,
    definitionUpdatedAt: 0,
    status: SegmentStatusEnum.Running,
  };
}

const state: RealtimeUserState = {
  userOrAnonymousId: "user-1",
  traits: {
    plan: "gold",
  },
  trackEvents: [
    {
      event: "Purchase",
      properties: {
        amount: 120,
      },
      eventTime: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
};

describe("evaluateRealtimeSegment", () => {
  it("evaluates trait and performed nodes through an AND node", () => {
    const result = evaluateRealtimeSegment({
      segment: segment({
        entryNode: {
          type: SegmentNodeType.And,
          id: "and",
          children: ["trait", "performed"],
        },
        nodes: [
          {
            type: SegmentNodeType.Trait,
            id: "trait",
            path: "plan",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "gold",
            },
          },
          {
            type: SegmentNodeType.Performed,
            id: "performed",
            event: "Purchase",
            times: 1,
            timesOperator: RelationalOperators.GreaterThanOrEqual,
            properties: [
              {
                path: "amount",
                operator: {
                  type: SegmentOperatorType.GreaterThanOrEqual,
                  value: 100,
                },
              },
            ],
          },
        ],
      }),
      state,
    });

    expect(result).toEqual({
      inSegment: true,
      unsupportedNodes: [],
    });
  });

  it("marks unsupported trait operators explicitly", () => {
    const result = evaluateRealtimeSegment({
      segment: segment({
        entryNode: {
          type: SegmentNodeType.Trait,
          id: "trait",
          path: "plan",
          operator: {
            type: SegmentOperatorType.HasBeen,
            comparator: SegmentHasBeenOperatorComparator.GTE,
            value: "gold",
            windowSeconds: 3600,
          },
        },
        nodes: [],
      }),
      state,
    });

    expect(result).toEqual({
      inSegment: false,
      unsupportedNodes: ["trait:unsupported trait operator HasBeen"],
    });
  });

  it("treats missing NotWithin timestamp traits as outside the window", () => {
    const result = evaluateRealtimeSegment({
      segment: segment({
        entryNode: {
          type: SegmentNodeType.Trait,
          id: "trait",
          path: "last_notification_activation_at",
          operator: {
            type: SegmentOperatorType.NotWithin,
            windowSeconds: 3600,
          },
        },
        nodes: [],
      }),
      state,
    });

    expect(result).toEqual({
      inSegment: true,
      unsupportedNodes: [],
    });
  });

  it("evaluates persisted withinSeconds performed windows without timeOperator", () => {
    const openedAt = new Date("2026-01-01T00:00:00.000Z");
    const timedState: RealtimeUserState = {
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
    const timedSegment = segment({
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
    });

    expect(
      evaluateRealtimeSegment({
        segment: timedSegment,
        state: timedState,
        now: new Date(openedAt.getTime() + 60_000),
      }).inSegment,
    ).toBe(false);
    expect(
      evaluateRealtimeSegment({
        segment: timedSegment,
        state: timedState,
        now: new Date(openedAt.getTime() + 601_000),
      }).inSegment,
    ).toBe(true);
    expect(
      evaluateRealtimeSegment({
        segment: timedSegment,
        state: timedState,
        now: new Date(openedAt.getTime() + 721_000),
      }).inSegment,
    ).toBe(false);
  });
});
