import { randomUUID } from "node:crypto";

import jp from "jsonpath";

import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  getChCompatibleUuid,
} from "../../../../clickhouse";
import logger from "../../../../logger";
import {
  EnrichedSegment,
  EnrichedUserProperty,
  GroupChildrenUserPropertyDefinitions,
  GroupUserPropertyDefinition,
  InternalEventType,
  LastPerformedSegmentNode,
  LeafUserPropertyDefinition,
  PerformedSegmentNode,
  RelationalOperators,
  SegmentHasBeenOperatorComparator,
  SegmentNode,
  SegmentNodeType,
  SegmentOperatorType,
  SubscriptionChange,
  SubscriptionGroupType,
  UserPropertyDefinitionType,
} from "../../../../types";

interface SegmentComputedProperty {
  type: "Segment";
  segment: EnrichedSegment;
}

interface UserComputedProperty {
  type: "UserProperty";
  userProperty: EnrichedUserProperty;
}

type ComputedProperty = SegmentComputedProperty | UserComputedProperty;

function pathToArgs(
  path: string,
  queryBuilder: ClickHouseQueryBuilder
): string | null {
  try {
    return jp
      .parse(path)
      .map((c) => queryBuilder.addQueryValue(c.expression.value, "String"))
      .join(", ");
  } catch (e) {
    logger().info({ err: e });
    return null;
  }
}

function jsonValueToCh(
  queryBuilder: ClickHouseQueryBuilder,
  val: unknown
): string {
  const type = typeof val;
  switch (type) {
    case "number": {
      return queryBuilder.addQueryValue(val, "Int32");
    }
    case "string": {
      return queryBuilder.addQueryValue(val, "String");
    }
    default:
      throw new Error(`Unhandled type ${type}`);
  }
}

function buildSegmentQueryExpression({
  currentTime,
  queryBuilder,
  node,
  nodes,
  segmentId,
}: {
  currentTime: number;
  segmentId: string;
  queryBuilder: ClickHouseQueryBuilder;
  node: SegmentNode;
  nodes: SegmentNode[];
}): string | null {
  switch (node.type) {
    case SegmentNodeType.SubscriptionGroup: {
      let hasProperties: LastPerformedSegmentNode["hasProperties"];
      switch (node.subscriptionGroupType) {
        case SubscriptionGroupType.OptIn:
          hasProperties = [
            {
              path: "action",
              operator: {
                type: SegmentOperatorType.Equals,
                value: SubscriptionChange.Subscribe,
              },
            },
          ];
          break;
        case SubscriptionGroupType.OptOut:
          hasProperties = [
            {
              path: "action",
              operator: {
                type: SegmentOperatorType.NotEquals,
                value: SubscriptionChange.Unsubscribe,
              },
            },
          ];
          break;
      }
      const lastPerformedNode: LastPerformedSegmentNode = {
        id: node.id,
        type: SegmentNodeType.LastPerformed,
        event: InternalEventType.SubscriptionChange,
        whereProperties: [
          {
            path: "subscriptionId",
            operator: {
              type: SegmentOperatorType.Equals,
              value: node.subscriptionGroupId,
            },
          },
        ],
        hasProperties,
      };
      return buildSegmentQueryExpression({
        currentTime,
        queryBuilder,
        node: lastPerformedNode,
        nodes,
        segmentId,
      });
    }
    case SegmentNodeType.Broadcast: {
      const performedNode: PerformedSegmentNode = {
        id: node.id,
        type: SegmentNodeType.Performed,
        event: InternalEventType.SegmentBroadcast,
        times: 1,
        timesOperator: RelationalOperators.GreaterThanOrEqual,
        properties: [
          {
            path: "segmentId",
            operator: {
              type: SegmentOperatorType.Equals,
              value: segmentId,
            },
          },
        ],
      };
      return buildSegmentQueryExpression({
        currentTime,
        queryBuilder,
        node: performedNode,
        nodes,
        segmentId,
      });
    }
    case SegmentNodeType.Email: {
      const performedNode: PerformedSegmentNode = {
        id: node.id,
        type: SegmentNodeType.Performed,
        event: node.event,
        times: 1,
        timesOperator: RelationalOperators.GreaterThanOrEqual,
        properties: [
          {
            path: "templateId",
            operator: {
              type: SegmentOperatorType.Equals,
              value: segmentId,
            },
          },
        ],
      };
      return buildSegmentQueryExpression({
        currentTime,
        queryBuilder,
        node: performedNode,
        nodes,
        segmentId,
      });
    }
    case SegmentNodeType.LastPerformed: {
      const event = queryBuilder.addQueryValue(node.event, "String");
      const whereConditions = ["m.4 == 'track'", `m.5 == ${event}`];

      if (node.whereProperties) {
        for (const property of node.whereProperties) {
          const path = queryBuilder.addQueryValue(
            `$.${property.path}`,
            "String"
          );
          const operatorType = property.operator.type;

          let condition: string;
          switch (operatorType) {
            case SegmentOperatorType.Equals: {
              const value = jsonValueToCh(
                queryBuilder,
                property.operator.value
              );
              condition = `
                JSON_VALUE(
                  m.1,
                  ${path}
                ) == ${value}
              `;
              break;
            }
            default:
              throw new Error(
                `Unimplemented operator for ${node.type} segment node ${operatorType}`
              );
          }
          whereConditions.push(condition);
        }
      }

      const assignmentVarName = getChCompatibleUuid();

      const assignment = `arrayFirst(
        m -> and(${whereConditions.join(",")}),
        timed_messages
      ).1 as ${assignmentVarName}`;

      const hasConditions: string[] = [];

      for (let i = 0; i < node.hasProperties.length; i++) {
        const where = i === 0 ? assignment : `${assignmentVarName}`;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const property = node.hasProperties[i]!;
        const operatorType = property.operator.type;
        const path = queryBuilder.addQueryValue(`$.${property.path}`, "String");

        let condition: string;
        switch (property.operator.type) {
          case SegmentOperatorType.Equals: {
            const value = jsonValueToCh(queryBuilder, property.operator.value);
            condition = `
                JSON_VALUE(
                  ${where},
                  ${path}
                ) == ${value}
              `;
            break;
          }
          case SegmentOperatorType.NotEquals: {
            const value = jsonValueToCh(queryBuilder, property.operator.value);
            condition = `
                JSON_VALUE(
                  ${where},
                  ${path}
                ) != ${value}
              `;
            break;
          }
          default:
            throw new Error(
              `Unimplemented operator for ${node.type} segment node ${operatorType}`
            );
        }
        hasConditions.push(condition);
      }

      if (hasConditions.length === 0) {
        return "1=0";
      }
      if (hasConditions.length === 1) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return hasConditions[0]!;
      }
      return `and(${hasConditions.join(",")})`;
    }
    case SegmentNodeType.Performed: {
      const event = queryBuilder.addQueryValue(node.event, "String");
      const conditions = ["m.4 == 'track'", `m.5 == ${event}`];

      if (node.properties) {
        for (const property of node.properties) {
          const path = queryBuilder.addQueryValue(
            `$.${property.path}`,
            "String"
          );
          const operatorType = property.operator.type;

          let condition: string;
          switch (operatorType) {
            case SegmentOperatorType.Equals: {
              const value = jsonValueToCh(
                queryBuilder,
                property.operator.value
              );
              condition = `
                JSON_VALUE(
                  m.1,
                  ${path}
                ) == ${value}
              `;
              break;
            }
            default:
              throw new Error(
                `Unimplemented segment operator for performed node ${operatorType}`
              );
          }
          conditions.push(condition);
        }
      }

      const times = node.times === undefined ? 1 : node.times;
      const operator: string = node.timesOperator ?? RelationalOperators.Equals;

      return `
        arrayCount(
          m -> and(${conditions.join(",")}),
          timed_messages
        ) ${operator} ${queryBuilder.addQueryValue(times, "Int32")}
      `;
    }
    case SegmentNodeType.Trait: {
      const pathArgs = pathToArgs(node.path, queryBuilder);
      const jsonValuePath = queryBuilder.addQueryValue(
        `$.${node.path}`,
        "String"
      );
      if (!pathArgs) {
        return null;
      }

      switch (node.operator.type) {
        case SegmentOperatorType.Equals: {
          const val = node.operator.value;
          let queryVal: string;

          switch (typeof val) {
            case "number": {
              queryVal = queryBuilder.addQueryValue(val, "Int32");
              break;
            }
            case "string": {
              queryVal = queryBuilder.addQueryValue(val, "String");
              break;
            }
          }

          // TODO use interpolation for node paths
          return `
            JSON_VALUE(
              (
                arrayFirst(
                  m -> JSONHas(m.1, ${pathArgs}),
                  timed_messages
                )
              ).1,
              ${jsonValuePath}
            ) == ${queryVal}
          `;
        }
        case SegmentOperatorType.HasBeen: {
          if (
            node.operator.comparator !== SegmentHasBeenOperatorComparator.GTE
          ) {
            throw new Error("Unimplemented comparator.");
          }

          const val = node.operator.value;
          const varName = `last_trait_update${getChCompatibleUuid()}`;
          const upperTraitBound =
            currentTime / 1000 - node.operator.windowSeconds;

          let queryVal: string;

          switch (typeof val) {
            case "number": {
              queryVal = queryBuilder.addQueryValue(val, "Int32");
              break;
            }
            case "string": {
              queryVal = queryBuilder.addQueryValue(val, "String");
              break;
            }
          }

          return `
            and(
              JSON_VALUE(
                (
                  arrayFirst(
                    m -> JSONHas(m.1, ${pathArgs}),
                    timed_messages
                  ) as ${varName}
                ).1,
                ${jsonValuePath}
              ) == ${queryVal},
              ${varName}.2 < toDateTime64(${upperTraitBound}, 3)
            )`;
        }
        case SegmentOperatorType.Within: {
          const upperTraitBound = currentTime / 1000;
          const traitIdentifier = getChCompatibleUuid();

          const lowerTraitBound =
            currentTime / 1000 - node.operator.windowSeconds;

          // TODO replace array find with array first
          return `
            and(
              (
                parseDateTime64BestEffortOrNull(
                  JSON_VALUE(
                    arrayFirst(
                      m -> JSONHas(m.1, ${pathArgs}),
                      timed_messages
                    ).1,
                    ${jsonValuePath}
                  )
                ) as trait_time${traitIdentifier}
              ) > toDateTime64(${lowerTraitBound}, 3),
              trait_time${traitIdentifier} < toDateTime64(${upperTraitBound}, 3)
            )`;
        }
        default:
          throw new Error(
            `Unimplemented operator for ${node.type} segment node ${node.operator.type}`
          );
      }
    }
    case SegmentNodeType.And: {
      const childIds = new Set(node.children);
      const childNodes = nodes.filter((n) => childIds.has(n.id));
      const childFragments = childNodes
        .map((childNode) =>
          buildSegmentQueryExpression({
            queryBuilder,
            currentTime,
            node: childNode,
            segmentId,
            nodes,
          })
        )
        .filter((query) => query !== null);
      if (childFragments.length === 0) {
        return null;
      }
      if (childFragments[0] && childFragments.length === 1) {
        return childFragments[0];
      }
      return `and(
        ${childFragments.join(", ")}
      )`;
    }
    case SegmentNodeType.Or: {
      const childIds = new Set(node.children);
      const childNodes = nodes.filter((n) => childIds.has(n.id));
      const childFragments = childNodes
        .map((childNode) =>
          buildSegmentQueryExpression({
            queryBuilder,
            currentTime,
            node: childNode,
            segmentId,
            nodes,
          })
        )
        .filter((query) => query !== null);
      if (childFragments.length === 0) {
        return null;
      }
      if (childFragments[0] && childFragments.length === 1) {
        return childFragments[0];
      }
      return `or(
        ${childFragments.join(", ")}
      )`;
    }
  }
}

function buildSegmentQueryFragment({
  currentTime,
  segment,
  queryBuilder,
}: {
  currentTime: number;
  segment: EnrichedSegment;
  queryBuilder: ClickHouseQueryBuilder;
}): string {
  const query = buildSegmentQueryExpression({
    queryBuilder,
    currentTime,
    node: segment.definition.entryNode,
    nodes: segment.definition.nodes,
    segmentId: segment.id,
  });

  if (query === null) {
    return `
      (
        false,
        Null,
        '${segment.id}'
      )
    `;
  }

  // TODO use query builder for this
  return `
    (
      ${query},
      Null,
      '${segment.id}'
    )
  `;
}

function buildLeafUserPropertyQueryExpression({
  userProperty,
  queryBuilder,
}: {
  userProperty: LeafUserPropertyDefinition;
  queryBuilder: ClickHouseQueryBuilder;
}): string | null {
  switch (userProperty.type) {
    case UserPropertyDefinitionType.Performed: {
      const { path } = userProperty;
      const jsonValuePath = queryBuilder.addQueryValue(`$.${path}`, "String");
      const pathArgs = pathToArgs(path, queryBuilder);
      if (!pathArgs) {
        return null;
      }

      return `
          JSON_VALUE(
            arrayFirst(
              m -> and(
                JSONHas(m.1, ${pathArgs}),
                m.5 = ${queryBuilder.addQueryValue(
                  userProperty.event,
                  "String"
                )}
              ),
              timed_messages
            ).1,
            ${jsonValuePath}
          )
      `;
    }
    case UserPropertyDefinitionType.Trait: {
      const { path } = userProperty;
      const jsonValuePath = queryBuilder.addQueryValue(`$.${path}`, "String");
      const pathArgs = pathToArgs(path, queryBuilder);
      if (!pathArgs) {
        return null;
      }

      return `
        JSON_VALUE(
          arrayFirst(
            m -> JSONHas(m.1, ${pathArgs}),
            timed_messages
          ).1,
          ${jsonValuePath}
        )
      `;
    }
  }
}

function buildGroupedUserPropertyQueryExpression({
  userProperty,
  child,
  queryBuilder,
}: {
  child: GroupChildrenUserPropertyDefinitions;
  userProperty: GroupUserPropertyDefinition;
  queryBuilder: ClickHouseQueryBuilder;
}): string | null {
  switch (child.type) {
    case UserPropertyDefinitionType.Performed: {
      return buildLeafUserPropertyQueryExpression({
        userProperty: child,
        queryBuilder,
      });
    }
    case UserPropertyDefinitionType.Trait: {
      return buildLeafUserPropertyQueryExpression({
        userProperty: child,
        queryBuilder,
      });
    }
    case UserPropertyDefinitionType.AnyOf: {
      const childIds = new Set(child.children);
      const childNodes = userProperty.nodes.filter(
        (n) => n.id && childIds.has(n.id)
      );
      const childFragments = childNodes
        .map((childNode) =>
          buildGroupedUserPropertyQueryExpression({
            child: childNode,
            userProperty,
            queryBuilder,
          })
        )
        .filter((query) => query !== null)
        .map((query) => {
          const queryId = getChCompatibleUuid();
          return `if(empty(${query} as ${queryId}), Null, ${queryId})`;
        });
      if (childFragments.length === 0) {
        return null;
      }
      if (childFragments[0] && childFragments.length === 1) {
        return childFragments[0];
      }
      return `coalesce(
        ${childFragments.join(", ")}
      )`;
    }
  }
}

function buildUserPropertyQueryExpression({
  userProperty,
  queryBuilder,
}: {
  userProperty: EnrichedUserProperty;
  queryBuilder: ClickHouseQueryBuilder;
}): string | null {
  switch (userProperty.definition.type) {
    case UserPropertyDefinitionType.Group: {
      const { entry } = userProperty.definition;

      const entryNode = userProperty.definition.nodes.find(
        (n) => n.id === entry
      );
      if (!entryNode) {
        return null;
      }
      return buildGroupedUserPropertyQueryExpression({
        userProperty: userProperty.definition,
        child: entryNode,
        queryBuilder,
      });
    }
    case UserPropertyDefinitionType.Id: {
      return "user_id";
    }
    case UserPropertyDefinitionType.AnonymousId: {
      return "any(anonymous_id)";
    }
    case UserPropertyDefinitionType.Trait: {
      return buildLeafUserPropertyQueryExpression({
        userProperty: userProperty.definition,
        queryBuilder,
      });
    }
    case UserPropertyDefinitionType.Performed: {
      return buildLeafUserPropertyQueryExpression({
        userProperty: userProperty.definition,
        queryBuilder,
      });
    }
    case UserPropertyDefinitionType.PerformedMany: {
      if (userProperty.definition.or.length === 0) {
        return null;
      }
      const orFragments = userProperty.definition.or.map(
        ({ event }) => `m.5 = ${queryBuilder.addQueryValue(event, "String")}`
      );
      return `
        toJSONString(
          arrayMap(
            m -> map('event', m.5, 'properties', m.1, 'timestamp', formatDateTime(m.2, '%Y-%m-%dT%H:%M:%S')),
            arrayFilter(
              m -> or(${orFragments.join(", ")}),
              timed_messages
            )
          )
        )
      `;
    }
  }
}

function buildUserPropertyQueryFragment({
  userProperty,
  queryBuilder,
}: {
  userProperty: EnrichedUserProperty;
  queryBuilder: ClickHouseQueryBuilder;
}): string {
  const innerQuery = buildUserPropertyQueryExpression({
    userProperty,
    queryBuilder,
  });

  if (innerQuery === null) {
    return `
      (
        Null,
        '""',
        '${userProperty.id}'
      )
    `;
  }

  // TODO remove json stringification
  return `
    (
      Null,
      toJSONString(${innerQuery}),
      '${userProperty.id}'
    )
  `;
}

function computedToQueryFragments({
  computedProperties,
  currentTime,
  queryBuilder,
}: {
  computedProperties: ComputedProperty[];
  currentTime: number;
  queryBuilder: ClickHouseQueryBuilder;
}): Map<string, string> {
  const withClause = new Map<string, string>();
  const modelFragments: string[] = [];

  for (const computedProperty of computedProperties) {
    switch (computedProperty.type) {
      case "UserProperty": {
        const fragment = buildUserPropertyQueryFragment({
          userProperty: computedProperty.userProperty,
          queryBuilder,
        });

        modelFragments.push(fragment);
        break;
      }
      case "Segment": {
        const fragment = buildSegmentQueryFragment({
          segment: computedProperty.segment,
          queryBuilder,
          currentTime,
        });

        modelFragments.push(fragment);
        break;
      }
    }
  }

  // TODO just sort in parent query
  withClause.set(
    "timed_messages",
    `
      arraySort(
        m -> -toInt64(m.2),
        arrayZip(
          groupArray(if(event_type == 'identify', JSONExtractString(message_raw, 'traits'), JSONExtractString(message_raw, 'properties'))),
          groupArray(event_time),
          groupArray(processing_time),
          groupArray(event_type),
          groupArray(if(isNull(event), '', event))
        )
      )
    `
  );
  const joinedModelsFragment = `
    arrayJoin(
        [
          ${modelFragments.join(",\n")}
        ]
    )
  `;
  withClause.set("models", joinedModelsFragment);
  withClause.set("in_segment", "models.1");
  withClause.set("user_property", "models.2");
  withClause.set("computed_property_id", "models.3");
  withClause.set(
    "latest_processing_time",
    "arrayMax(m -> toInt64(m.3), timed_messages)"
  );
  withClause.set("history_length", "length(timed_messages)");

  return withClause;
}

export default async function writeAssignments({
  currentTime,
  segments,
  userProperties,
  tableVersion,
  workspaceId,
}: {
  currentTime: number;
  segments: EnrichedSegment[];
  tableVersion: string;
  workspaceId: string;
  userProperties: EnrichedUserProperty[];
}) {
  const segmentComputedProperties: ComputedProperty[] = segments.map(
    (segment) => {
      const p: SegmentComputedProperty = {
        type: "Segment",
        segment,
      };
      return p;
    }
  );

  const userComputedProperties: ComputedProperty[] = userProperties.map(
    (userProperty) => {
      const p: UserComputedProperty = {
        type: "UserProperty",
        userProperty,
      };
      return p;
    }
  );

  const computedProperties = segmentComputedProperties.concat(
    userComputedProperties
  );

  if (computedProperties.length) {
    const writeReadChqb = new ClickHouseQueryBuilder();

    const withClause = computedToQueryFragments({
      currentTime,
      computedProperties,
      queryBuilder: writeReadChqb,
    });

    // TODO handle anonymous id's, including case where user_id is null
    const joinedWithClause = Array.from(withClause)
      .map(([key, value]) => `${value} AS ${key}`)
      .join(",\n");

    const writeQuery = `
      INSERT INTO computed_property_assignments
      SELECT
        '${workspaceId}',
        sas.user_id,
        if(isNull(in_segment), 1, 2),
        sas.computed_property_id,
        coalesce(sas.in_segment, False),
        coalesce(sas.user_property, ''),
        now64(3)
      FROM (
        SELECT
          ${joinedWithClause},
          user_id,
          history_length,
          in_segment,
          user_property,
          latest_processing_time
        FROM user_events_${tableVersion}
        WHERE workspace_id == '${workspaceId}' AND isNotNull(user_id)
        GROUP BY user_id
        ORDER BY latest_processing_time DESC
      ) sas
    `;

    const queryId = randomUUID();

    try {
      await clickhouseClient().query({
        query: writeQuery,
        query_params: writeReadChqb.getQueries(),
        query_id: queryId,
        format: "JSONEachRow",
      });
    } catch (e) {
      logger().error(
        { workspaceId, queryId, err: e },
        "failed write assignments query"
      );
      throw e;
    }
    logger().info({ workspaceId, queryId }, "write assignments query");
  }
}
