import { ClickHouseQueryBuilder } from "../clickhouse";
import {
  buildComputeStateInsertQuery,
  findMatchingTraitUserProperty,
  segmentNodeToStateSubQuery,
} from "./computePropertiesIncremental";
import {
  SavedSegmentResource,
  SavedUserPropertyResource,
  SegmentHasBeenOperatorComparator,
  SegmentNodeType,
  SegmentOperatorType,
  UserPropertyDefinitionType,
} from "../types";

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

  it("builds identify_events_v2 queries grouped by user for simple trait segments", () => {
    const qb = new ClickHouseQueryBuilder();
    const [subQuery] = segmentNodeToStateSubQuery({
      segment,
      node: segment.definition.entryNode,
      qb,
    });
    expect(subQuery?.useIdentifyEventsTable).toBe(true);
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
    expect(query).toContain("from identify_events_v2 ue");
    expect(query).toContain(
      "group by\n      ue.workspace_id, ue.user_or_anonymous_id",
    );
    expect(query).not.toContain("ue.event_time\n");
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
    expect(query).toContain(
      "group by\n      ue.workspace_id, ue.user_or_anonymous_id, ue.event_time",
    );
  });
});
