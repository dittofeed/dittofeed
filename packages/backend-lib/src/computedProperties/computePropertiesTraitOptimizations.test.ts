import { ClickHouseQueryBuilder } from "../clickhouse";
import {
  CursorDirectionEnum,
  SavedSegmentResource,
  SavedUserPropertyResource,
  SegmentHasBeenOperatorComparator,
  SegmentNodeType,
  SegmentOperatorType,
  UserPropertyDefinitionType,
} from "../types";
import {
  buildCombinedTraitStateInsertQuery,
  buildComputeStateInsertQuery,
  findMatchingTraitUserProperty,
  groupTraitSubQueriesForCombinedScan,
  segmentNodeToStateSubQuery,
} from "./computePropertiesIncremental";

describe("computePropertiesTraitOptimizations", () => {
  const userProperties: SavedUserPropertyResource[] = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "email",
      workspaceId: "00000000-0000-4000-8000-000000000099",
      definition: {
        type: UserPropertyDefinitionType.Trait,
        path: "email",
      },
      definitionUpdatedAt: 1,
      updatedAt: 1,
      createdAt: 1,
    },
  ];

  const segment: SavedSegmentResource = {
    id: "00000000-0000-4000-8000-000000000002",
    name: "emailSegment",
    workspaceId: "00000000-0000-4000-8000-000000000099",
    definition: {
      entryNode: {
        type: SegmentNodeType.Trait,
        id: "node-1",
        path: "email",
        operator: {
          type: SegmentOperatorType.Equals,
          value: "test@email.com",
        },
      },
      nodes: [],
    },
    definitionUpdatedAt: 2,
    updatedAt: 2,
    createdAt: 2,
    resourceType: "Declarative",
    status: "Running",
  };

  it("finds a matching trait user property by path", () => {
    const match = findMatchingTraitUserProperty({
      traitPath: "email",
      userProperties,
    });
    expect(match?.userProperty.name).toBe("email");
    expect(match?.stateId).toBeTruthy();
  });

  it("builds current user trait values queries grouped by user for simple trait segments", () => {
    const qb = new ClickHouseQueryBuilder();
    const [subQuery] = segmentNodeToStateSubQuery({
      segment,
      node: segment.definition.entryNode,
      qb,
    });
    expect(subQuery?.useIdentifyEventsTable).toBe(false);
    expect(subQuery?.useTraitValuesTable).toBe(true);
    expect(subQuery?.groupByUserOnly).toBe(true);
    expect(subQuery?.traitPath).toBe("email");

    const query = buildComputeStateInsertQuery({
      subQuery: subQuery!,
      workspaceIdClause: qb.addQueryValue(
        "00000000-0000-4000-8000-000000000099",
        "String",
      ),
      nowSeconds: 1,
      lowerBoundClause: "",
      joinedPrior: "",
    });
    expect(query).toContain("from user_trait_values_current tv");
    expect(query).toContain("trait_path = 'email'");
    expect(query).toContain("group by\n      tv.workspace_id, tv.user_id");
    expect(query).toContain("and tv.user_id != ''");
    expect(query).not.toContain("tv.event_time\n");
  });

  it("keeps per-event grouping for HasBeen trait segments", () => {
    const qb = new ClickHouseQueryBuilder();
    const [subQuery] = segmentNodeToStateSubQuery({
      segment: {
        ...segment,
        definition: {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: "node-1",
            path: "status",
            operator: {
              type: SegmentOperatorType.HasBeen,
              value: "onboarding",
              comparator: SegmentHasBeenOperatorComparator.GTE,
              windowSeconds: 3600,
            },
          },
          nodes: [],
        },
      },
      node: {
        type: SegmentNodeType.Trait,
        id: "node-1",
        path: "status",
        operator: {
          type: SegmentOperatorType.HasBeen,
          value: "onboarding",
          comparator: SegmentHasBeenOperatorComparator.GTE,
          windowSeconds: 3600,
        },
      },
      qb,
    });
    expect(subQuery?.useIdentifyEventsTable).toBe(true);
    expect(subQuery?.useTraitValuesTable).toBe(false);
    expect(subQuery?.groupByUserOnly).toBe(false);

    const query = buildComputeStateInsertQuery({
      subQuery: subQuery!,
      workspaceIdClause: qb.addQueryValue(
        "00000000-0000-4000-8000-000000000099",
        "String",
      ),
      nowSeconds: 1,
      lowerBoundClause: "",
      joinedPrior: "",
    });
    expect(query).toContain("from identify_events_v2 ue");
    expect(query).toContain("JSON_VALUE(properties");
    expect(query).not.toContain("tv.trait_value");
    expect(query).toContain(
      "group by\n      ue.workspace_id, ue.user_id, ue.event_time",
    );
    expect(query).toContain("and ue.user_id != ''");
  });

  it("builds track_events_v2 queries grouped by user for performed segments", () => {
    const qb = new ClickHouseQueryBuilder();
    const performedSegment: SavedSegmentResource = {
      ...segment,
      name: "depositSegment",
      definition: {
        entryNode: {
          type: SegmentNodeType.Performed,
          id: "performed-1",
          event: "SUCCESS_DEPOSIT",
          times: 1,
        },
        nodes: [],
      },
    };
    const [subQuery] = segmentNodeToStateSubQuery({
      segment: performedSegment,
      node: performedSegment.definition.entryNode,
      qb,
    });
    expect(subQuery?.useTrackEventsTable).toBe(true);
    expect(subQuery?.groupByUserOnly).toBe(true);
    expect(subQuery?.uniqValue).toBe("message_id");

    const query = buildComputeStateInsertQuery({
      subQuery: subQuery!,
      workspaceIdClause: qb.addQueryValue(
        "00000000-0000-4000-8000-000000000099",
        "String",
      ),
      nowSeconds: 1,
      lowerBoundClause: "",
      joinedPrior: "",
    });
    expect(query).toContain("from track_events_v2 ue");
    expect(query).toContain("group by\n      ue.workspace_id, ue.user_id");
    expect(query).toContain("and ue.user_id != ''");
    expect(query).not.toContain("ue.event_time\n");
  });

  it("keeps per-event grouping for performed segments with withinSeconds", () => {
    const qb = new ClickHouseQueryBuilder();
    const performedSegment: SavedSegmentResource = {
      ...segment,
      definition: {
        entryNode: {
          type: SegmentNodeType.Performed,
          id: "performed-1",
          event: "SUCCESS_DEPOSIT",
          times: 1,
          withinSeconds: 3600,
        },
        nodes: [],
      },
    };
    const [subQuery] = segmentNodeToStateSubQuery({
      segment: performedSegment,
      node: performedSegment.definition.entryNode,
      qb,
    });
    expect(subQuery?.useTrackEventsTable).toBe(true);
    expect(subQuery?.groupByUserOnly).toBe(false);

    const query = buildComputeStateInsertQuery({
      subQuery: subQuery!,
      workspaceIdClause: qb.addQueryValue(
        "00000000-0000-4000-8000-000000000099",
        "String",
      ),
      nowSeconds: 1,
      lowerBoundClause: "",
      joinedPrior: "",
    });
    expect(query).toContain("from track_events_v2 ue");
    expect(query).toContain(
      "group by\n      ue.workspace_id, ue.user_id, ue.event_time",
    );
    expect(query).toContain("and ue.user_id != ''");
  });

  it("propagates performed fast-path through And segment nodes", () => {
    const qb = new ClickHouseQueryBuilder();
    const andSegment: SavedSegmentResource = {
      ...segment,
      name: "andSegment",
      definition: {
        entryNode: {
          type: SegmentNodeType.And,
          id: "and-1",
          children: ["performed-1", "performed-2"],
        },
        nodes: [
          {
            type: SegmentNodeType.Performed,
            id: "performed-1",
            event: "SUCCESS_DEPOSIT",
            times: 1,
          },
          {
            type: SegmentNodeType.Performed,
            id: "performed-2",
            event: "EMAIL_CONFIRMED",
            times: 1,
          },
        ],
      },
    };
    const subQueries = segmentNodeToStateSubQuery({
      segment: andSegment,
      node: andSegment.definition.entryNode,
      qb,
    });
    expect(subQueries).toHaveLength(2);
    expect(subQueries.every((sq) => sq.useTrackEventsTable)).toBe(true);
    expect(subQueries.every((sq) => sq.groupByUserOnly)).toBe(true);
  });

  it("groups combinable trait subqueries for a single-scan And segment", () => {
    const qb = new ClickHouseQueryBuilder();
    const andTraitSegment: SavedSegmentResource = {
      ...segment,
      name: "activePlayer",
      definition: {
        entryNode: {
          type: SegmentNodeType.And,
          id: "and-1",
          children: ["trait-banned", "trait-suspended"],
        },
        nodes: [
          {
            type: SegmentNodeType.Trait,
            id: "trait-banned",
            path: "banned",
            operator: {
              type: SegmentOperatorType.NotEquals,
              value: "true",
            },
          },
          {
            type: SegmentNodeType.Trait,
            id: "trait-suspended",
            path: "suspended",
            operator: {
              type: SegmentOperatorType.NotEquals,
              value: "true",
            },
          },
        ],
      },
    };
    const subQueries = segmentNodeToStateSubQuery({
      segment: andTraitSegment,
      node: andTraitSegment.definition.entryNode,
      qb,
    });
    expect(subQueries).toHaveLength(2);
    expect(subQueries.every((sq) => sq.useTraitValuesTable)).toBe(true);
    expect(subQueries.every((sq) => sq.groupByUserOnly)).toBe(true);

    const tasks = groupTraitSubQueriesForCombinedScan(subQueries);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.kind).toBe("combined");
    if (tasks[0]?.kind !== "combined") {
      throw new Error("expected combined task");
    }
    expect(tasks[0].subQueries).toHaveLength(2);

    const query = buildCombinedTraitStateInsertQuery({
      subQueries: tasks[0].subQueries,
      workspaceIdClause: qb.addQueryValue(
        "00000000-0000-4000-8000-000000000099",
        "String",
      ),
      nowSeconds: 1,
      lowerBoundClause: "",
    });
    expect(query).toContain("with per_trait as");
    expect(query).toContain("from user_trait_values_current tv");
    expect(query).toContain("trait_path in ('banned', 'suspended')");
    expect(query).not.toMatch(/argMaxState\([^)]*\bas last_value\b/);
    expect(query).toContain("from per_trait");
    expect(query).toContain(
      "group by\n          workspace_id,\n          user_id",
    );
    expect(query).toContain("and tv.user_id != ''");
  });

  it("replaces tv.trait_value in combined NotExists uniqValue expressions", () => {
    const qb = new ClickHouseQueryBuilder();
    const andNotExistsSegment: SavedSegmentResource = {
      ...segment,
      name: "wheelTraits",
      definition: {
        entryNode: {
          type: SegmentNodeType.And,
          id: "and-1",
          children: ["trait-wheel", "trait-online"],
        },
        nodes: [
          {
            type: SegmentNodeType.Trait,
            id: "trait-wheel",
            path: "wheelLastSpinTimestamp",
            operator: {
              type: SegmentOperatorType.NotExists,
            },
          },
          {
            type: SegmentNodeType.Trait,
            id: "trait-online",
            path: "isOnline",
            operator: {
              type: SegmentOperatorType.NotExists,
            },
          },
        ],
      },
    };
    const subQueries = segmentNodeToStateSubQuery({
      segment: andNotExistsSegment,
      node: andNotExistsSegment.definition.entryNode,
      qb,
    });
    const tasks = groupTraitSubQueriesForCombinedScan(subQueries);
    if (tasks[0]?.kind !== "combined") {
      throw new Error("expected combined task");
    }

    const query = buildCombinedTraitStateInsertQuery({
      subQueries: tasks[0].subQueries,
      workspaceIdClause: qb.addQueryValue(
        "00000000-0000-4000-8000-000000000099",
        "String",
      ),
      nowSeconds: 1,
      lowerBoundClause: "",
    });
    expect(query).toMatch(
      /uniqState\(\s*if\(\s*trait_value == '',\s*'E',\s*'N'\s*\)\s*\)/,
    );
    expect(query).toContain("from per_trait");
  });

  it("builds current user trait values queries grouped by user for Within trait segments", () => {
    const qb = new ClickHouseQueryBuilder();
    const [subQuery] = segmentNodeToStateSubQuery({
      segment: {
        ...segment,
        definition: {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: "node-1",
            path: "created_at",
            operator: {
              type: SegmentOperatorType.Within,
              windowSeconds: 604800,
            },
          },
          nodes: [],
        },
      },
      node: {
        type: SegmentNodeType.Trait,
        id: "node-1",
        path: "created_at",
        operator: {
          type: SegmentOperatorType.Within,
          windowSeconds: 604800,
        },
      },
      qb,
    });
    expect(subQuery?.useTraitValuesTable).toBe(true);
    expect(subQuery?.useIdentifyEventsTable).toBe(false);
    expect(subQuery?.groupByUserOnly).toBe(true);

    const query = buildComputeStateInsertQuery({
      subQuery: subQuery!,
      workspaceIdClause: qb.addQueryValue(
        "00000000-0000-4000-8000-000000000099",
        "String",
      ),
      nowSeconds: 1,
      lowerBoundClause: "",
      joinedPrior: "",
    });
    expect(query).toContain("from user_trait_values_current tv");
    expect(query).toContain("trait_path = 'created_at'");
    expect(query).not.toContain("from identify_events_v2 ue");
    expect(query).toContain("group by\n      tv.workspace_id, tv.user_id");
    expect(query).toContain("and tv.user_id != ''");
    expect(query).not.toContain("tv.event_time\n");
  });

  it("builds current user trait values queries grouped by user for NotWithin trait segments", () => {
    const qb = new ClickHouseQueryBuilder();
    const [subQuery] = segmentNodeToStateSubQuery({
      segment: {
        ...segment,
        definition: {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: "node-1",
            path: "lastVisit",
            operator: {
              type: SegmentOperatorType.NotWithin,
              windowSeconds: 345600,
            },
          },
          nodes: [],
        },
      },
      node: {
        type: SegmentNodeType.Trait,
        id: "node-1",
        path: "lastVisit",
        operator: {
          type: SegmentOperatorType.NotWithin,
          windowSeconds: 345600,
        },
      },
      qb,
    });
    expect(subQuery?.useTraitValuesTable).toBe(true);
    expect(subQuery?.useIdentifyEventsTable).toBe(false);
    expect(subQuery?.groupByUserOnly).toBe(true);

    const query = buildComputeStateInsertQuery({
      subQuery: subQuery!,
      workspaceIdClause: qb.addQueryValue(
        "00000000-0000-4000-8000-000000000099",
        "String",
      ),
      nowSeconds: 1,
      lowerBoundClause: "",
      joinedPrior: "",
    });
    expect(query).toContain("from user_trait_values_current tv");
    expect(query).toContain("trait_path = 'lastVisit'");
    expect(query).not.toContain("from identify_events_v2 ue");
  });

  it("builds current user trait values queries grouped by user for AbsoluteTimestamp trait segments", () => {
    const qb = new ClickHouseQueryBuilder();
    const [subQuery] = segmentNodeToStateSubQuery({
      segment: {
        ...segment,
        definition: {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: "node-1",
            path: "created_at",
            operator: {
              type: SegmentOperatorType.AbsoluteTimestamp,
              absoluteTimestamp: "2026-01-01T00:00:00.000Z",
              direction: CursorDirectionEnum.After,
            },
          },
          nodes: [],
        },
      },
      node: {
        type: SegmentNodeType.Trait,
        id: "node-1",
        path: "created_at",
        operator: {
          type: SegmentOperatorType.AbsoluteTimestamp,
          absoluteTimestamp: "2026-01-01T00:00:00.000Z",
          direction: CursorDirectionEnum.After,
        },
      },
      qb,
    });
    expect(subQuery?.useTraitValuesTable).toBe(true);
    expect(subQuery?.groupByUserOnly).toBe(true);

    const query = buildComputeStateInsertQuery({
      subQuery: subQuery!,
      workspaceIdClause: qb.addQueryValue(
        "00000000-0000-4000-8000-000000000099",
        "String",
      ),
      nowSeconds: 1,
      lowerBoundClause: "",
      joinedPrior: "",
    });
    expect(query).toContain("from user_trait_values_current tv");
    expect(query).not.toContain("toStartOfInterval(event_time");
  });

  it("keeps per-event grouping for Within on nested trait paths", () => {
    const qb = new ClickHouseQueryBuilder();
    const [subQuery] = segmentNodeToStateSubQuery({
      segment: {
        ...segment,
        definition: {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: "node-1",
            path: "profile.created_at",
            operator: {
              type: SegmentOperatorType.Within,
              windowSeconds: 604800,
            },
          },
          nodes: [],
        },
      },
      node: {
        type: SegmentNodeType.Trait,
        id: "node-1",
        path: "profile.created_at",
        operator: {
          type: SegmentOperatorType.Within,
          windowSeconds: 604800,
        },
      },
      qb,
    });
    expect(subQuery?.useTraitValuesTable).toBe(false);
    expect(subQuery?.useIdentifyEventsTable).toBe(true);
    expect(subQuery?.groupByUserOnly).toBe(false);
  });

  it("keeps non-combinable subqueries as single tasks", () => {
    const qb = new ClickHouseQueryBuilder();
    const andSegment: SavedSegmentResource = {
      ...segment,
      definition: {
        entryNode: {
          type: SegmentNodeType.And,
          id: "and-1",
          children: ["trait-1", "performed-1"],
        },
        nodes: [
          {
            type: SegmentNodeType.Trait,
            id: "trait-1",
            path: "email",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "test@email.com",
            },
          },
          {
            type: SegmentNodeType.Performed,
            id: "performed-1",
            event: "SUCCESS_DEPOSIT",
            times: 1,
          },
        ],
      },
    };
    const subQueries = segmentNodeToStateSubQuery({
      segment: andSegment,
      node: andSegment.definition.entryNode,
      qb,
    });
    const tasks = groupTraitSubQueriesForCombinedScan(subQueries);
    expect(tasks).toHaveLength(2);
    expect(tasks.every((task) => task.kind === "single")).toBe(true);
  });
});
