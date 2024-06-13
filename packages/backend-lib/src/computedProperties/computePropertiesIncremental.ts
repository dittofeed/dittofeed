/* eslint-disable no-await-in-loop */

import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import jsonPath from "jsonpath";
import { v5 as uuidv5 } from "uuid";

import {
  ClickHouseQueryBuilder,
  command,
  getChCompatibleUuid,
  query as chQuery,
  streamClickhouseQuery,
} from "../clickhouse";
import config from "../config";
import { HUBSPOT_INTEGRATION } from "../constants";
import { startHubspotUserIntegrationWorkflow } from "../integrations/hubspot/signalUtils";
import { getSubscribedSegments } from "../journeys";
import {
  getUserJourneyWorkflowId,
  segmentUpdateSignal,
  userJourneyWorkflow,
} from "../journeys/userWorkflow";
import logger from "../logger";
import { withSpan } from "../openTelemetry";
import { upsertBulkSegmentAssignments } from "../segments";
import { getContext } from "../temporal/activity";
import {
  BroadcastSegmentNode,
  ComputedAssignment,
  ComputedPropertyAssignment,
  ComputedPropertyStep,
  ComputedPropertyUpdate,
  EmailSegmentNode,
  GroupChildrenUserPropertyDefinitions,
  GroupUserPropertyDefinition,
  HasStartedJourneyResource,
  InternalEventType,
  LastPerformedSegmentNode,
  LeafUserPropertyDefinition,
  ManualSegmentNode,
  NodeEnvEnum,
  PerformedSegmentNode,
  RelationalOperators,
  SavedHasStartedJourneyResource,
  SavedIntegrationResource,
  SavedSegmentResource,
  SavedUserPropertyResource,
  SegmentNode,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentUpdate,
  SubscriptionChange,
  SubscriptionGroupSegmentNode,
  SubscriptionGroupType,
  UserPropertyDefinitionType,
  UserPropertyOperatorType,
} from "../types";
import { insertProcessedComputedProperties } from "../userEvents/clickhouse";
import { upsertBulkUserPropertyAssignments } from "../userProperties";
import { createPeriods, getPeriodsByComputedPropertyId } from "./periods";

function broadcastSegmentToPerformed(
  segmentId: string,
  node: BroadcastSegmentNode,
): PerformedSegmentNode {
  return {
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
}

function emailSegmentToPerformed(node: EmailSegmentNode): PerformedSegmentNode {
  return {
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
          value: node.templateId,
        },
      },
    ],
  };
}

interface IndexedStateConfig {
  stateId: string;
  expression: string;
}

interface AssignedSegmentConfig {
  stateIds: string[];
  expression: string;
}

function manualSegmentToLastPerformed({
  node,
  segment,
}: {
  node: ManualSegmentNode;
  segment: SavedSegmentResource;
}): LastPerformedSegmentNode {
  return {
    type: SegmentNodeType.LastPerformed,
    id: node.id,
    event: InternalEventType.ManualSegmentUpdate,
    whereProperties: [
      {
        path: "segmentId",
        operator: {
          type: SegmentOperatorType.Equals,
          value: segment.id,
        },
      },
      {
        path: "version",
        operator: {
          type: SegmentOperatorType.Equals,
          value: node.version,
        },
      },
    ],
    hasProperties: [
      {
        path: "inSegment",
        operator: {
          type: SegmentOperatorType.Equals,
          value: 1,
        },
      },
    ],
  };
}

function subscriptionChangeToPerformed(
  node: SubscriptionGroupSegmentNode,
): LastPerformedSegmentNode {
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

  return {
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
}

async function signalJourney({
  segmentId,
  workspaceId,
  segmentAssignment,
  journey,
}: {
  segmentId: string;
  workspaceId: string;
  segmentAssignment: ComputedAssignment;
  journey: HasStartedJourneyResource;
}) {
  const segmentUpdate: SegmentUpdate = {
    segmentId,
    currentlyInSegment: Boolean(segmentAssignment.latest_segment_value),
    segmentVersion: new Date(segmentAssignment.max_assigned_at).getTime(),
    type: "segment",
  };

  if (!segmentUpdate.currentlyInSegment) {
    return;
  }

  const { workflowClient } = getContext();
  const { id: journeyId, definition } = journey;

  const workflowId = getUserJourneyWorkflowId({
    journeyId,
    userId: segmentAssignment.user_id,
  });

  const userId = segmentAssignment.user_id;

  await workflowClient.signalWithStart<
    typeof userJourneyWorkflow,
    [SegmentUpdate]
  >(userJourneyWorkflow, {
    taskQueue: "default",
    workflowId,
    args: [
      {
        journeyId,
        definition,
        workspaceId,
        userId,
      },
    ],
    signal: segmentUpdateSignal,
    signalArgs: [segmentUpdate],
  });
}

interface FullSubQueryData {
  condition: string;
  type: "user_property" | "segment";
  computedPropertyId: string;
  stateId: string;
  argMaxValue?: string;
  uniqValue?: string;
  eventTimeExpression?: string;
  recordMessageId?: boolean;
  joinPriorStateValue?: boolean;
  // used to force computed properties to refresh when definition changes
  version: string;
}
type SubQueryData = Omit<FullSubQueryData, "version">;

export function segmentNodeStateId(
  segment: SavedSegmentResource,
  nodeId: string,
): string {
  return uuidv5(
    `${segment.definitionUpdatedAt.toString()}:${nodeId}`,
    segment.id,
  );
}

function segmentToIndexed({
  segment,
  node,
}: {
  segment: SavedSegmentResource;
  node: SegmentNode;
}): IndexedStateConfig[] {
  switch (node.type) {
    case SegmentNodeType.Trait: {
      const stateId = segmentNodeStateId(segment, node.id);

      switch (node.operator.type) {
        case SegmentOperatorType.Within: {
          return [
            {
              stateId,
              expression: `toUnixTimestamp(parseDateTimeBestEffortOrZero(argMaxMerge(last_value)))`,
            },
          ];
        }
        case SegmentOperatorType.HasBeen: {
          return [
            {
              stateId,
              expression: `toUnixTimestamp(max(event_time))`,
            },
          ];
        }
        default:
          return [];
      }
    }
    case SegmentNodeType.And: {
      return node.children.flatMap((child) => {
        const childNode = segment.definition.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              segment,
              child,
              node,
            },
            "AND child node not found",
          );
          return [];
        }
        return segmentToIndexed({
          node: childNode,
          segment,
        });
      });
    }
    case SegmentNodeType.Or: {
      return node.children.flatMap((child) => {
        const childNode = segment.definition.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              segment,
              child,
              node,
            },
            "OR child node not found",
          );
          return [];
        }
        return segmentToIndexed({
          node: childNode,
          segment,
        });
      });
    }
    default:
      return [];
  }
}

function getLowerBoundClause(bound?: number): string {
  return bound && bound > 0
    ? `and computed_at >= toDateTime64(${bound / 1000}, 3)`
    : "";
}

function buildRecentUpdateSegmentQuery({
  workspaceId,
  stateId,
  expression,
  segmentId,
  now,
  periodBound,
  qb,
}: {
  workspaceId: string;
  now: number;
  segmentId: string;
  periodBound?: number;
  stateId: string;
  expression: string;
  qb: ClickHouseQueryBuilder;
}): string {
  const nowSeconds = now / 1000;
  const lowerBoundClause = getLowerBoundClause(periodBound);

  const query = `
    insert into resolved_segment_state
    select
      workspace_id,
      computed_property_id,
      state_id,
      user_id,
      ${expression},
      max(event_time),
      toDateTime64(${nowSeconds}, 3) as assigned_at
    from computed_property_state_v2 as cps
    where
      (
        workspace_id,
        computed_property_id,
        state_id,
        user_id
      ) in (
        select
          workspace_id,
          computed_property_id,
          state_id,
          user_id
        from updated_computed_property_state
        where
          workspace_id = ${qb.addQueryValue(workspaceId, "String")}
          and type = 'segment'
          and computed_property_id = ${qb.addQueryValue(segmentId, "String")}
          and state_id = ${qb.addQueryValue(stateId, "String")}
          and computed_at <= toDateTime64(${nowSeconds}, 3)
          ${lowerBoundClause}
      )
    group by
      workspace_id,
      computed_property_id,
      state_id,
      user_id
  `;
  return query;
}

function segmentToResolvedState({
  workspaceId,
  segment,
  now,
  node,
  qb,
  periodBound,
}: {
  workspaceId: string;
  segment: SavedSegmentResource;
  now: number;
  node: SegmentNode;
  periodBound?: number;
  qb: ClickHouseQueryBuilder;
}): string[] {
  const nowSeconds = now / 1000;
  const stateId = segmentNodeStateId(segment, node.id);
  switch (node.type) {
    case SegmentNodeType.Performed: {
      const operator: string = node.timesOperator ?? RelationalOperators.Equals;
      const times = node.times === undefined ? 1 : node.times;

      const segmentIdParam = qb.addQueryValue(segment.id, "String");
      const stateIdParam = qb.addQueryValue(stateId, "String");
      const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
      if (node.withinSeconds && node.withinSeconds > 0) {
        const query = `
          insert into resolved_segment_state
          select
            multiIf(
              notEmpty(within_range.workspace_id), within_range.workspace_id,
              notEmpty(deduped_rss.workspace_id), deduped_rss.workspace_id,
              ''
            ) default_workspace_id,
            multiIf(
              notEmpty(within_range.computed_property_id), within_range.computed_property_id,
              notEmpty(deduped_rss.segment_id), deduped_rss.segment_id,
              ''
            ) default_segment_id,
            multiIf(
              notEmpty(within_range.state_id), within_range.state_id,
              notEmpty(deduped_rss.state_id), deduped_rss.state_id,
              ''
            ) default_state_id,
            multiIf(
              notEmpty(within_range.user_id), within_range.user_id,
              notEmpty(deduped_rss.user_id), deduped_rss.user_id,
              ''
            ) default_user_id,
            within_range.segment_state_value,
            multiIf(
              notEmpty(within_range.workspace_id), within_range.max_event_time,
              notEmpty(deduped_rss.workspace_id), deduped_rss.max_event_time,
              toDateTime64(0, 3)
            ) default_max_event_time,
            toDateTime64(${nowSeconds}, 3)
          from (
            select
              workspace_id,
              segment_id,
              state_id,
              user_id,
              argMax(segment_state_value, computed_at) as segment_state_value,
              max(max_event_time) as max_event_time
            from resolved_segment_state rss
            where
              rss.workspace_id = ${workspaceIdParam}
              and rss.segment_id = ${segmentIdParam}
              and rss.state_id = ${stateIdParam}
              and rss.segment_state_value = True
            group by
              workspace_id,
              segment_id,
              state_id,
              user_id
          ) as deduped_rss
          full outer join (
            select
              workspace_id,
              computed_property_id,
              state_id,
              user_id,
              uniqMerge(cps.unique_count) ${operator} ${times} as segment_state_value,
              max(cps.event_time) as max_event_time
            from computed_property_state_v2 cps
            where
              cps.workspace_id = ${workspaceIdParam}
              and cps.type = 'segment'
              and cps.computed_property_id = ${segmentIdParam}
              and cps.state_id = ${stateIdParam}
              and cps.event_time >= toDateTime64(${Math.round(
                Math.max(nowSeconds - node.withinSeconds, 0),
              )}, 3)
            group by
              workspace_id,
              computed_property_id,
              state_id,
              user_id
          ) as within_range on
            within_range.workspace_id = deduped_rss.workspace_id
            and within_range.computed_property_id = deduped_rss.segment_id
            and within_range.state_id = deduped_rss.state_id
            and within_range.user_id = deduped_rss.user_id
        `;

        return [query];
      }
      return [
        buildRecentUpdateSegmentQuery({
          segmentId: segment.id,
          periodBound,
          now,
          workspaceId,
          stateId,
          expression: `uniqMerge(cps.unique_count) ${operator} ${times} as segment_state_value`,
          qb,
        }),
      ];
    }
    case SegmentNodeType.Trait: {
      switch (node.operator.type) {
        case SegmentOperatorType.Within: {
          const withinLowerBound = Math.round(
            Math.max(nowSeconds - node.operator.windowSeconds, 0),
          );
          const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
          const computedPropertyIdParam = qb.addQueryValue(
            segment.id,
            "String",
          );
          const stateIdParam = qb.addQueryValue(stateId, "String");
          const query = `
            insert into resolved_segment_state
            select
                cpsi.workspace_id,
                cpsi.computed_property_id,
                cpsi.state_id,
                cpsi.user_id,
                argMax(cpsi.indexed_value, state.event_time) >= ${qb.addQueryValue(
                  withinLowerBound,
                  "Int32",
                )} within_range,
                max(state.event_time),
                toDateTime64(${nowSeconds}, 3) as assigned_at
            from computed_property_state_index cpsi
            full outer join (
              select
                workspace_id,
                segment_id,
                state_id,
                user_id,
                argMax(segment_state_value, computed_at) as segment_state_value,
                max(max_event_time) as max_event_time
              from resolved_segment_state
              where
                workspace_id = ${workspaceIdParam}
                and segment_id = ${computedPropertyIdParam}
                and state_id = ${stateIdParam}
              group by
                workspace_id,
                segment_id,
                state_id,
                user_id
            ) as rss on
              rss.workspace_id  = cpsi.workspace_id
              and rss.segment_id  = cpsi.computed_property_id
              and rss.state_id  = cpsi.state_id
              and rss.user_id  = cpsi.user_id
            left join computed_property_state_v2 state on
              state.workspace_id = cpsi.workspace_id
              and state.type = cpsi.type
              and state.computed_property_id = cpsi.computed_property_id
              and state.state_id = cpsi.state_id
              and state.user_id = cpsi.user_id
            where
              cpsi.workspace_id = ${workspaceIdParam}
              and cpsi.type = 'segment'
              and cpsi.computed_property_id = ${computedPropertyIdParam}
              and cpsi.state_id = ${stateIdParam}
              and (
                (
                    cpsi.indexed_value >= ${qb.addQueryValue(
                      withinLowerBound,
                      "Int32",
                    )}
                    and (
                        rss.workspace_id = ''
                        or rss.segment_state_value = False
                    )
                )
                or rss.segment_state_value = True
              )
           group by
              cpsi.workspace_id,
              cpsi.computed_property_id,
              cpsi.state_id,
              cpsi.user_id;
          `;
          return [query];
        }
        case SegmentOperatorType.HasBeen: {
          const upperBound = Math.round(
            Math.max(nowSeconds - node.operator.windowSeconds, 0),
          );

          const upperBoundParam = qb.addQueryValue(upperBound, "Int32");
          const lastValueParam = qb.addQueryValue(
            node.operator.value,
            "String",
          );

          const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
          const computedPropertyIdParam = qb.addQueryValue(
            segment.id,
            "String",
          );
          const stateIdParam = qb.addQueryValue(stateId, "String");
          const query = `
            insert into resolved_segment_state
            select
                cpsi.workspace_id,
                cpsi.computed_property_id,
                cpsi.state_id,
                cpsi.user_id,
                (
                  max(cpsi.indexed_value) <= ${upperBoundParam}
                  and argMax(state.merged_last_value, state.max_event_time) == ${lastValueParam}
                ) has_been,
                max(state.max_event_time),
                toDateTime64(${nowSeconds}, 3) as assigned_at
            from computed_property_state_index cpsi
            full outer join (
              select
                workspace_id,
                segment_id,
                state_id,
                user_id,
                argMax(segment_state_value, computed_at) as segment_state_value,
                max(max_event_time) as max_event_time
              from resolved_segment_state
              where
                workspace_id = ${workspaceIdParam}
                and segment_id = ${computedPropertyIdParam}
                and state_id = ${stateIdParam}
              group by
                workspace_id,
                segment_id,
                state_id,
                user_id
            ) as rss on
              rss.workspace_id  = cpsi.workspace_id
              and rss.segment_id  = cpsi.computed_property_id
              and rss.state_id  = cpsi.state_id
              and rss.user_id  = cpsi.user_id
            left join (
              select
                workspace_id,
                type,
                computed_property_id,
                state_id,
                user_id,
                argMaxMerge(last_value) merged_last_value,
                max(event_time) max_event_time
              from computed_property_state_v2
              where
                type = 'segment'
              group by
                workspace_id,
                type,
                computed_property_id,
                state_id,
                user_id
            ) state on
              state.workspace_id = cpsi.workspace_id
              and state.type = cpsi.type
              and state.computed_property_id = cpsi.computed_property_id
              and state.state_id = cpsi.state_id
              and state.user_id = cpsi.user_id
            where
              cpsi.workspace_id = ${workspaceIdParam}
              and cpsi.type = 'segment'
              and cpsi.computed_property_id = ${computedPropertyIdParam}
              and cpsi.state_id = ${stateIdParam}
              and (
                (
                    cpsi.indexed_value <= ${upperBoundParam}
                    and (
                        rss.workspace_id = ''
                        or rss.segment_state_value = False
                    )
                )
                or rss.segment_state_value = True
              )
            group by
              cpsi.workspace_id,
              cpsi.computed_property_id,
              cpsi.state_id,
              cpsi.user_id;
          `;
          return [query];
        }
        case SegmentOperatorType.Equals: {
          return [
            buildRecentUpdateSegmentQuery({
              workspaceId,
              stateId,
              expression: `argMaxMerge(last_value) == ${qb.addQueryValue(
                node.operator.value,
                "String",
              )}`,
              segmentId: segment.id,
              now,
              periodBound,
              qb,
            }),
          ];
        }
        case SegmentOperatorType.NotEquals: {
          return [
            buildRecentUpdateSegmentQuery({
              workspaceId,
              stateId,
              expression: `argMaxMerge(last_value) != ${qb.addQueryValue(
                node.operator.value,
                "String",
              )}`,
              segmentId: segment.id,
              now,
              periodBound,
              qb,
            }),
          ];
        }
        case SegmentOperatorType.Exists: {
          return [
            buildRecentUpdateSegmentQuery({
              workspaceId,
              stateId,
              expression: `argMaxMerge(last_value) != ''`,
              segmentId: segment.id,
              now,
              periodBound,
              qb,
            }),
          ];
        }
        default:
          throw new Error(
            `Unimplemented segment node type ${node.type} for segment: ${segment.id} and node: ${node.id}`,
          );
      }
    }
    case SegmentNodeType.And: {
      return node.children.flatMap((child) => {
        const childNode = segment.definition.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              segment,
              child,
              node,
            },
            "AND child node not found",
          );
          return [];
        }
        return segmentToResolvedState({
          node: childNode,
          segment,
          now,
          periodBound,
          workspaceId,
          qb,
        });
      });
    }
    case SegmentNodeType.Or: {
      return node.children.flatMap((child) => {
        const childNode = segment.definition.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              segment,
              child,
              node,
            },
            "OR child node not found",
          );
          return [];
        }
        return segmentToResolvedState({
          node: childNode,
          segment,
          now,
          periodBound,
          workspaceId,
          qb,
        });
      });
    }
    case SegmentNodeType.Broadcast: {
      logger().error("broadcast segment is deprecated");
      return [];
    }
    case SegmentNodeType.Email: {
      const performedNode = emailSegmentToPerformed(node);
      return segmentToResolvedState({
        node: performedNode,
        segment,
        now,
        periodBound,
        workspaceId,
        qb,
      });
    }
    case SegmentNodeType.SubscriptionGroup: {
      const performedNode = subscriptionChangeToPerformed(node);
      return segmentToResolvedState({
        node: performedNode,
        segment,
        now,
        periodBound,
        workspaceId,
        qb,
      });
    }
    case SegmentNodeType.LastPerformed: {
      const varName = qb.getVariableName();
      const hasPropertyConditions = node.hasProperties.map((property, i) => {
        const operatorType = property.operator.type;
        const reference =
          i === 0
            ? `(JSONExtract(argMaxMerge(last_value), 'Array(String)') as ${varName})`
            : varName;
        const indexedReference = `${reference}[${i + 1}]`;

        switch (operatorType) {
          case SegmentOperatorType.Equals: {
            return `${indexedReference} == ${qb.addQueryValue(
              String(property.operator.value),
              "String",
            )}`;
          }
          case SegmentOperatorType.NotEquals: {
            return `${indexedReference} != ${qb.addQueryValue(
              String(property.operator.value),
              "String",
            )}`;
          }
          default:
            throw new Error(
              `Unimplemented segment operator for performed node ${operatorType} for segment: ${segment.id} and node: ${node.id}`,
            );
        }
      });
      const expression = hasPropertyConditions.length
        ? `(${hasPropertyConditions.join(" and ")})`
        : `1=1`;

      return [
        buildRecentUpdateSegmentQuery({
          workspaceId,
          stateId,
          expression,
          segmentId: segment.id,
          now,
          periodBound,
          qb,
        }),
      ];
    }
    case SegmentNodeType.Manual: {
      return segmentToResolvedState({
        node: manualSegmentToLastPerformed({
          node,
          segment,
        }),
        segment,
        now,
        periodBound,
        workspaceId,
        qb,
      });
    }
    default:
      assertUnreachable(node);
  }
}

function resolvedSegmentToAssignment({
  segment,
  qb,
  node,
}: {
  segment: SavedSegmentResource;
  node: SegmentNode;
  qb: ClickHouseQueryBuilder;
}): AssignedSegmentConfig {
  const stateId = segmentNodeStateId(segment, node.id);
  const stateIdParam = qb.addQueryValue(stateId, "String");
  const stateValue = `state_values[${stateIdParam}]`;
  switch (node.type) {
    case SegmentNodeType.Trait: {
      return {
        stateIds: [stateId],
        expression: stateValue,
      };
    }
    case SegmentNodeType.Performed: {
      return {
        stateIds: [stateId],
        expression: stateValue,
      };
    }
    case SegmentNodeType.And: {
      const children = node.children.flatMap((child) => {
        const childNode = segment.definition.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              segment,
              child,
              node,
            },
            "AND child node not found",
          );
          return [];
        }
        return resolvedSegmentToAssignment({
          node: childNode,
          segment,
          qb,
        });
      });
      if (children.length === 0) {
        return {
          stateIds: [],
          expression: "False",
        };
      }
      const child = children[0];
      if (children.length === 1 && child) {
        return child;
      }
      return {
        stateIds: children.flatMap((c) => c.stateIds),
        expression: `(${children.map((c) => c.expression).join(" and ")})`,
      };
    }
    case SegmentNodeType.Or: {
      const children = node.children.flatMap((child) => {
        const childNode = segment.definition.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              segment,
              child,
              node,
            },
            "OR child node not found",
          );
          return [];
        }
        return resolvedSegmentToAssignment({
          node: childNode,
          segment,
          qb,
        });
      });
      if (children.length === 0) {
        return {
          stateIds: [],
          expression: "False",
        };
      }
      const child = children[0];
      if (children.length === 1 && child) {
        return child;
      }
      return {
        stateIds: children.flatMap((c) => c.stateIds),
        expression: `(${children.map((c) => c.expression).join(" or ")})`,
      };
    }
    case SegmentNodeType.Broadcast: {
      logger().error("broadcast segment is deprecated");
      return {
        stateIds: [],
        expression: "False",
      };
    }
    case SegmentNodeType.Email: {
      const performedNode = emailSegmentToPerformed(node);
      return resolvedSegmentToAssignment({
        node: performedNode,
        segment,
        qb,
      });
    }
    case SegmentNodeType.SubscriptionGroup: {
      const performedNode = subscriptionChangeToPerformed(node);
      return resolvedSegmentToAssignment({
        node: performedNode,
        segment,
        qb,
      });
    }
    case SegmentNodeType.LastPerformed: {
      return {
        stateIds: [stateId],
        expression: stateValue,
      };
    }
    case SegmentNodeType.Manual: {
      return resolvedSegmentToAssignment({
        node: manualSegmentToLastPerformed({
          node,
          segment,
        }),
        segment,
        qb,
      });
    }
    default:
      assertUnreachable(node);
  }
}

function toJsonPathParam({
  path,
  qb,
}: {
  path: string;
  qb: ClickHouseQueryBuilder;
}): string | null {
  let unvalidated: string;
  if (path.startsWith("$")) {
    unvalidated = path;
  } else {
    unvalidated = `$.${path}`;
  }
  try {
    jsonPath.parse(unvalidated);
  } catch (e) {
    logger().debug(
      {
        unvalidated,
        err: e,
      },
      "invalid json path in node path",
    );
    return null;
  }
  return qb.addQueryValue(unvalidated, "String");
}

function truncateEventTimeExpression(windowSeconds: number): string {
  // Window data within 1 / 10th of the specified period, with a minumum
  // window of 30 seconds, and a maximum window of 1 day.
  const eventTimeInterval = Math.min(
    Math.max(Math.floor(windowSeconds / 10), 1),
    86400,
  );
  return `toDateTime64(toStartOfInterval(event_time, toIntervalSecond(${eventTimeInterval})), 3)`;
}

export function segmentNodeToStateSubQuery({
  segment,
  node,
  qb,
}: {
  segment: SavedSegmentResource;
  node: SegmentNode;
  qb: ClickHouseQueryBuilder;
}): SubQueryData[] {
  switch (node.type) {
    case SegmentNodeType.Trait: {
      const stateId = segmentNodeStateId(segment, node.id);
      const path = toJsonPathParam({
        path: node.path,
        qb,
      });
      if (!path) {
        return [];
      }
      if (node.operator.type === SegmentOperatorType.NotEquals) {
        const varName = qb.getVariableName();
        return [
          {
            condition: `event_type == 'identify'`,
            type: "segment",
            uniqValue: "''",
            // using stateId as placeholder string to allow NotEquals to select
            // empty values. no real danger of collissions given that stateId is
            // a uuid
            argMaxValue: `
              if(
                (JSON_VALUE(properties, ${path}) as ${varName}) == '',
                ${qb.addQueryValue(stateId, "String")},
                ${varName}
              )
            `,
            computedPropertyId: segment.id,
            stateId,
          },
        ];
      }
      const eventTimeExpression: string | undefined =
        node.operator.type === SegmentOperatorType.HasBeen ||
        node.operator.type === SegmentOperatorType.Within
          ? truncateEventTimeExpression(node.operator.windowSeconds)
          : undefined;

      return [
        {
          condition: `event_type == 'identify'`,
          type: "segment",
          joinPriorStateValue:
            node.operator.type === SegmentOperatorType.HasBeen,
          uniqValue: "''",
          argMaxValue: `JSON_VALUE(properties, ${path})`,
          eventTimeExpression,
          computedPropertyId: segment.id,
          stateId,
        },
      ];
    }
    case SegmentNodeType.Performed: {
      const stateId = segmentNodeStateId(segment, node.id);
      const event = qb.addQueryValue(node.event, "String");
      const propertyConditions = node.properties?.map((property) => {
        const operatorType = property.operator.type;
        switch (operatorType) {
          case SegmentOperatorType.Equals: {
            const path = toJsonPathParam({
              path: property.path,
              qb,
            });
            if (!path) {
              return [];
            }
            return `JSON_VALUE(properties, ${path}) == ${qb.addQueryValue(
              property.operator.value,
              "String",
            )}`;
          }
          default:
            throw new Error(
              `Unimplemented segment operator for performed node ${operatorType} for segment: ${segment.id} and node: ${node.id}`,
            );
        }
      });
      const propertyClause = propertyConditions?.length
        ? `and (${propertyConditions.join(" and ")})`
        : "";
      const eventTimeExpression: string | undefined = node.withinSeconds
        ? truncateEventTimeExpression(node.withinSeconds)
        : undefined;
      return [
        {
          condition: `event_type == 'track' and event == ${event} ${propertyClause}`,
          type: "segment",
          eventTimeExpression,
          uniqValue: "message_id",
          argMaxValue: "''",
          computedPropertyId: segment.id,
          stateId,
        },
      ];
    }
    case SegmentNodeType.And: {
      return node.children.flatMap((child) => {
        const childNode = segment.definition.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              segment,
              child,
              node,
            },
            "AND child node not found",
          );
          return [];
        }
        return segmentNodeToStateSubQuery({
          node: childNode,
          segment,
          qb,
        });
      });
    }
    case SegmentNodeType.Or: {
      return node.children.flatMap((child) => {
        const childNode = segment.definition.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              segment,
              child,
              node,
            },
            "Or child node not found",
          );
          return [];
        }
        return segmentNodeToStateSubQuery({
          node: childNode,
          segment,
          qb,
        });
      });
    }
    case SegmentNodeType.Manual: {
      return segmentNodeToStateSubQuery({
        node: manualSegmentToLastPerformed({
          node,
          segment,
        }),
        segment,
        qb,
      });
    }
    case SegmentNodeType.LastPerformed: {
      const stateId = segmentNodeStateId(segment, node.id);
      const whereConditions = node.whereProperties?.map((property) => {
        const operatorType = property.operator.type;
        const path = toJsonPathParam({
          path: property.path,
          qb,
        });
        if (!path) {
          return [];
        }
        const propertyValue = `JSON_VALUE(properties, ${path})`;
        switch (operatorType) {
          case SegmentOperatorType.Equals: {
            return `${propertyValue} == ${qb.addQueryValue(
              property.operator.value,
              "String",
            )}`;
          }
          case SegmentOperatorType.NotEquals: {
            return `${propertyValue} != ${qb.addQueryValue(
              property.operator.value,
              "String",
            )}`;
          }
          default:
            throw new Error(
              `Unimplemented segment operator for performed node ${operatorType} for segment: ${segment.id} and node: ${node.id}`,
            );
        }
      });
      const wherePropertyClause = whereConditions?.length
        ? `and (${whereConditions.join(" and ")})`
        : "";
      const propertyValues = node.hasProperties.flatMap((property) => {
        const path = toJsonPathParam({
          path: property.path,
          qb,
        });
        if (!path) {
          return [];
        }
        return `JSON_VALUE(properties, ${path})`;
      });
      if (propertyValues.length === 0) {
        return [];
      }

      const event = qb.addQueryValue(node.event, "String");
      const condition = `event_type == 'track' and event == ${event} ${wherePropertyClause}`;
      return [
        {
          condition,
          type: "segment",
          uniqValue: "''",
          argMaxValue: `toJSONString([${propertyValues.join(", ")}])`,
          computedPropertyId: segment.id,
          stateId,
        },
      ];
    }
    case SegmentNodeType.Broadcast: {
      const performedNode: PerformedSegmentNode = broadcastSegmentToPerformed(
        segment.id,
        node,
      );
      return segmentNodeToStateSubQuery({
        node: performedNode,
        segment,
        qb,
      });
    }
    case SegmentNodeType.Email: {
      const performedNode: PerformedSegmentNode = emailSegmentToPerformed(node);
      return segmentNodeToStateSubQuery({
        node: performedNode,
        segment,
        qb,
      });
    }
    case SegmentNodeType.SubscriptionGroup: {
      const performedNode: LastPerformedSegmentNode =
        subscriptionChangeToPerformed(node);
      return segmentNodeToStateSubQuery({
        node: performedNode,
        segment,
        qb,
      });
    }
  }
}

export function userPropertyStateId(
  userProperty: SavedUserPropertyResource,
  nodeId = "",
): string {
  const stateId = uuidv5(
    `${userProperty.definitionUpdatedAt.toString()}:${nodeId}`,
    userProperty.id,
  );
  return stateId;
}

function leafUserPropertyToSubQuery({
  userProperty,
  child,
  qb,
}: {
  userProperty: SavedUserPropertyResource;
  child: LeafUserPropertyDefinition;
  qb: ClickHouseQueryBuilder;
}): SubQueryData | null {
  switch (child.type) {
    case UserPropertyDefinitionType.Trait: {
      const stateId = userPropertyStateId(userProperty, child.id);
      if (child.path.length === 0) {
        return null;
      }
      const path = toJsonPathParam({
        path: child.path,
        qb,
      });
      if (!path) {
        return null;
      }
      return {
        condition: `event_type == 'identify'`,
        type: "user_property",
        uniqValue: "''",
        argMaxValue: `JSON_VALUE(properties, ${path})`,
        computedPropertyId: userProperty.id,
        stateId,
      };
    }
    case UserPropertyDefinitionType.Performed: {
      const stateId = userPropertyStateId(userProperty, child.id);
      if (child.path.length === 0) {
        return null;
      }
      const path = toJsonPathParam({
        path: child.path,
        qb,
      });
      if (!path) {
        return null;
      }
      let propertiesCondition: string | null = null;
      if (child.properties && Object.keys(child.properties).length > 0) {
        propertiesCondition = child.properties
          // eslint-disable-next-line array-callback-return
          .flatMap((property) => {
            switch (property.operator.type) {
              case UserPropertyOperatorType.Equals: {
                const propertyPath = toJsonPathParam({
                  path: property.path,
                  qb,
                });
                if (!propertyPath) {
                  return [];
                }
                return `JSON_VALUE(properties, ${propertyPath}) == ${qb.addQueryValue(
                  property.operator.value,
                  "String",
                )}`;
              }
            }
          })
          .join(" and ");
      }
      return {
        condition: `event_type == 'track' and event = ${qb.addQueryValue(
          child.event,
          "String",
        )}${propertiesCondition ? ` AND (${propertiesCondition})` : ""} `,
        type: "user_property",
        uniqValue: "''",
        argMaxValue: `JSON_VALUE(properties, ${path})`,
        computedPropertyId: userProperty.id,
        stateId,
      };
    }
  }
}

function groupedUserPropertyToSubQuery({
  userProperty,
  group,
  node,
  qb,
}: {
  userProperty: SavedUserPropertyResource;
  node: GroupChildrenUserPropertyDefinitions;
  group: GroupUserPropertyDefinition;
  qb: ClickHouseQueryBuilder;
}): SubQueryData[] {
  switch (node.type) {
    case UserPropertyDefinitionType.AnyOf: {
      return node.children.flatMap((child) => {
        const childNode = group.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              userProperty,
              child,
              node,
            },
            "Grouped user property child node not found",
          );
          return [];
        }
        return groupedUserPropertyToSubQuery({
          userProperty,
          node: childNode,
          group,
          qb,
        });
      });
    }
    case UserPropertyDefinitionType.Trait: {
      const subQuery = leafUserPropertyToSubQuery({
        userProperty,
        child: node,
        qb,
      });

      if (!subQuery) {
        return [];
      }
      return [subQuery];
    }
    case UserPropertyDefinitionType.Performed: {
      const subQuery = leafUserPropertyToSubQuery({
        userProperty,
        child: node,
        qb,
      });

      if (!subQuery) {
        return [];
      }
      return [subQuery];
    }
  }
}

function userPropertyToSubQuery({
  userProperty,
  qb,
}: {
  userProperty: SavedUserPropertyResource;
  qb: ClickHouseQueryBuilder;
}): SubQueryData[] {
  const stateId = userPropertyStateId(userProperty);
  switch (userProperty.definition.type) {
    case UserPropertyDefinitionType.Trait: {
      const subQuery = leafUserPropertyToSubQuery({
        userProperty,
        child: userProperty.definition,
        qb,
      });

      if (!subQuery) {
        return [];
      }
      return [subQuery];
    }
    case UserPropertyDefinitionType.Performed: {
      const subQuery = leafUserPropertyToSubQuery({
        userProperty,
        child: userProperty.definition,
        qb,
      });

      if (!subQuery) {
        return [];
      }
      return [subQuery];
    }
    case UserPropertyDefinitionType.Group: {
      const entryId = userProperty.definition.entry;
      const entryNode = userProperty.definition.nodes.find(
        (n) => n.id === entryId,
      );
      if (!entryNode) {
        logger().error(
          {
            userProperty,
            entryId,
          },
          "Grouped user property entry node not found",
        );
        return [];
      }
      return groupedUserPropertyToSubQuery({
        userProperty,
        node: entryNode,
        group: userProperty.definition,
        qb,
      });
    }
    case UserPropertyDefinitionType.PerformedMany: {
      return [
        {
          condition: `event_type == 'track' and has(${qb.addQueryValue(
            userProperty.definition.or.map((event) => event.event),
            "Array(String)",
          )}, event)`,
          type: "user_property",
          recordMessageId: true,
          computedPropertyId: userProperty.id,
          stateId,
        },
      ];
    }
    case UserPropertyDefinitionType.AnonymousId: {
      return [
        {
          condition: "True",
          type: "user_property",
          computedPropertyId: userProperty.id,
          argMaxValue: "anonymous_id",
          stateId,
        },
      ];
    }
    case UserPropertyDefinitionType.Id: {
      return [
        {
          condition: "True",
          type: "user_property",
          computedPropertyId: userProperty.id,
          argMaxValue: "user_or_anonymous_id",
          stateId,
        },
      ];
    }
  }
}

enum UserPropertyAssignmentType {
  Standard = "Standard",
  PerformedMany = "PerformedMany",
}

interface StandardUserPropertyAssignmentConfig {
  type: UserPropertyAssignmentType.Standard;
  query: string;
  // ids of states to aggregate that need to fall within bounded time window
  stateIds: string[];
}

interface PerformedManyUserPropertyAssignmentConfig {
  type: UserPropertyAssignmentType.PerformedMany;
  stateId: string;
}

type UserPropertyAssignmentConfig =
  | StandardUserPropertyAssignmentConfig
  | PerformedManyUserPropertyAssignmentConfig;

function assignStandardUserPropertiesQuery({
  workspaceId,
  config: ac,
  userPropertyId,
  periodBound,
  qb,
  now,
}: {
  workspaceId: string;
  now: number;
  qb: ClickHouseQueryBuilder;
  periodBound?: number;
  userPropertyId: string;
  config: StandardUserPropertyAssignmentConfig;
}): string | null {
  const nowSeconds = now / 1000;

  if (!ac.stateIds.length) {
    return null;
  }
  const lowerBoundClause =
    periodBound && periodBound !== 0
      ? `and computed_at >= toDateTime64(${periodBound / 1000}, 3)`
      : "";
  const boundedQuery = `
    select
      workspace_id,
      type,
      computed_property_id,
      state_id,
      user_id
    from updated_computed_property_state
    where
      workspace_id = ${qb.addQueryValue(workspaceId, "String")}
      and type = 'user_property'
      and computed_property_id = ${qb.addQueryValue(userPropertyId, "String")}
      and state_id in ${qb.addQueryValue(ac.stateIds, "Array(String)")}
      and computed_at <= toDateTime64(${nowSeconds}, 3)
      ${lowerBoundClause}
  `;
  const query = `
    insert into computed_property_assignments_v2
    select
      workspace_id,
      type,
      computed_property_id,
      user_id,
      False as segment_value,
      ${ac.query} as user_property_value,
      arrayReduce('max', mapValues(max_event_time)),
      toDateTime64(${nowSeconds}, 3) as assigned_at
    from (
      select
        workspace_id,
        type,
        computed_property_id,
        user_id,
        CAST((groupArray(state_id), groupArray(last_value)), 'Map(String, String)') as last_value,
        CAST((groupArray(state_id), groupArray(unique_count)), 'Map(String, Int32)') as unique_count,
        CAST((groupArray(state_id), groupArray(max_event_time)), 'Map(String, DateTime64(3))') as max_event_time
      from (
        select
          workspace_id,
          type,
          computed_property_id,
          state_id,
          user_id,
          argMaxMerge(last_value) last_value,
          uniqMerge(unique_count) unique_count,
          max(event_time) max_event_time
        from computed_property_state_v2 cps
        where
          (
            workspace_id,
            type,
            computed_property_id,
            state_id,
            user_id
          ) in (${boundedQuery})
        group by
          workspace_id,
          type,
          computed_property_id,
          state_id,
          user_id
      )
      group by
        workspace_id,
        type,
        computed_property_id,
        user_id
    )
  `;
  return query;
}

function assignPerformedManyUserPropertiesQuery({
  workspaceId,
  config: ac,
  userPropertyId,
  periodBound,
  qb,
  now,
}: {
  workspaceId: string;
  now: number;
  qb: ClickHouseQueryBuilder;
  periodBound?: number;
  userPropertyId: string;
  config: PerformedManyUserPropertyAssignmentConfig;
}): string {
  const nowSeconds = now / 1000;

  const lowerBoundClause =
    periodBound && periodBound !== 0
      ? `and computed_at >= toDateTime64(${periodBound / 1000}, 3)`
      : "";
  const computedPropertyIdParam = qb.addQueryValue(userPropertyId, "String");
  const stateIdParam = qb.addQueryValue(ac.stateId, "String");
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const boundedQuery = `
    select
      workspace_id,
      type,
      computed_property_id,
      state_id,
      user_id
    from updated_computed_property_state
    where
      workspace_id = ${workspaceIdParam}
      and type = 'user_property'
      and computed_property_id = ${computedPropertyIdParam}
      and state_id = ${stateIdParam}
      and computed_at <= toDateTime64(${nowSeconds}, 3)
      ${lowerBoundClause}
  `;
  const query = `
    INSERT INTO computed_property_assignments_v2
    SELECT
      workspace_id,
      'user_property' AS type,
      ${computedPropertyIdParam} AS computed_property_id,
      user_id,
      False AS segment_value,
      toJSONString(
        arrayMap(
            event -> map(
                'event', event.1,
                'timestamp', formatDateTime(event.2, '%Y-%m-%dT%H:%i:%S'),
                'properties', event.3
            ),
            arraySort(
                e -> (- toInt32(e.2)),
                groupArray(
                    (
                        ue.event,
                        ue.event_time,
                        ue.properties
                    )
                )
            )
        )
      ) AS user_property_value,
      max(event_time) AS max_event_time,
      toDateTime64(${nowSeconds}, 3) AS assigned_at
    FROM
      user_events_v2 AS ue
    WHERE
      workspace_id = ${workspaceIdParam}
      AND message_id IN (
        SELECT
            arrayJoin(groupArrayMerge(cps.grouped_message_ids)) AS message_ids
        FROM
            computed_property_state_v2 AS cps
        WHERE
            (
                workspace_id,
                type,
                computed_property_id,
                state_id,
                user_id
            ) IN (${boundedQuery})
      )
    GROUP BY
      workspace_id,
      user_id;
  `;
  return query;
}

function assignUserPropertiesQuery({
  workspaceId,
  config: ac,
  userPropertyId,
  periodBound,
  qb,
  now,
}: {
  workspaceId: string;
  now: number;
  qb: ClickHouseQueryBuilder;
  periodBound?: number;
  userPropertyId: string;
  config: UserPropertyAssignmentConfig;
}): string | null {
  switch (ac.type) {
    case UserPropertyAssignmentType.Standard: {
      return assignStandardUserPropertiesQuery({
        workspaceId,
        config: ac,
        userPropertyId,
        periodBound,
        qb,
        now,
      });
    }
    case UserPropertyAssignmentType.PerformedMany: {
      return assignPerformedManyUserPropertiesQuery({
        workspaceId,
        config: ac,
        userPropertyId,
        periodBound,
        qb,
        now,
      });
    }
  }
}

function leafUserPropertyToAssignment({
  userProperty,
  child,
  qb,
}: {
  userProperty: SavedUserPropertyResource;
  child: LeafUserPropertyDefinition;
  qb: ClickHouseQueryBuilder;
}): StandardUserPropertyAssignmentConfig {
  switch (child.type) {
    case UserPropertyDefinitionType.Trait: {
      const stateId = userPropertyStateId(userProperty, child.id);
      return {
        query: `last_value[${qb.addQueryValue(stateId, "String")}]`,
        type: UserPropertyAssignmentType.Standard,
        stateIds: [stateId],
      };
    }
    case UserPropertyDefinitionType.Performed: {
      const stateId = userPropertyStateId(userProperty, child.id);
      return {
        query: `last_value[${qb.addQueryValue(stateId, "String")}]`,
        type: UserPropertyAssignmentType.Standard,
        stateIds: [stateId],
      };
    }
  }
}

function groupedUserPropertyToAssignment({
  userProperty,
  group,
  node,
  qb,
}: {
  userProperty: SavedUserPropertyResource;
  node: GroupChildrenUserPropertyDefinitions;
  group: GroupUserPropertyDefinition;
  qb: ClickHouseQueryBuilder;
}): StandardUserPropertyAssignmentConfig | null {
  switch (node.type) {
    case UserPropertyDefinitionType.AnyOf: {
      const childNodes = node.children.flatMap((child) => {
        const childNode = group.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              userProperty,
              child,
              node,
            },
            "Grouped user property child node not found",
          );
          return [];
        }
        const assignment = groupedUserPropertyToAssignment({
          userProperty,
          node: childNode,
          group,
          qb,
        });
        if (!assignment) {
          return [];
        }
        return assignment;
      });
      if (childNodes.length === 0) {
        return null;
      }
      if (childNodes.length === 1 && childNodes[0]) {
        return childNodes[0];
      }
      const query = `coalesce(${childNodes
        .map((c) => {
          const varName = qb.getVariableName();
          return `if((${c.query} as ${varName}) == '', Null, ${varName})`;
        })
        .join(", ")})`;
      return {
        query,
        type: UserPropertyAssignmentType.Standard,
        stateIds: childNodes.flatMap((c) => c.stateIds),
      };
    }
    case UserPropertyDefinitionType.Trait: {
      return leafUserPropertyToAssignment({
        userProperty,
        child: node,
        qb,
      });
    }
    case UserPropertyDefinitionType.Performed: {
      return leafUserPropertyToAssignment({
        userProperty,
        child: node,
        qb,
      });
    }
  }
}

function userPropertyToAssignment({
  userProperty,
  qb,
}: {
  userProperty: SavedUserPropertyResource;
  qb: ClickHouseQueryBuilder;
}): UserPropertyAssignmentConfig | null {
  switch (userProperty.definition.type) {
    case UserPropertyDefinitionType.Trait: {
      return leafUserPropertyToAssignment({
        userProperty,
        child: userProperty.definition,
        qb,
      });
    }
    case UserPropertyDefinitionType.Group: {
      const entryId = userProperty.definition.entry;
      const entryNode = userProperty.definition.nodes.find(
        (n) => n.id === entryId,
      );
      if (!entryNode) {
        logger().error(
          {
            userProperty,
            entryId,
          },
          "Grouped user property entry node not found",
        );
        return null;
      }
      return groupedUserPropertyToAssignment({
        userProperty,
        node: entryNode,
        group: userProperty.definition,
        qb,
      });
    }
    case UserPropertyDefinitionType.PerformedMany: {
      const stateId = userPropertyStateId(userProperty);
      return {
        type: UserPropertyAssignmentType.PerformedMany,
        stateId,
      };
    }
    case UserPropertyDefinitionType.AnonymousId: {
      const stateId = userPropertyStateId(userProperty);
      return {
        type: UserPropertyAssignmentType.Standard,
        query: `last_value[${qb.addQueryValue(stateId, "String")}]`,
        stateIds: [stateId],
      };
    }
    case UserPropertyDefinitionType.Id: {
      const stateId = userPropertyStateId(userProperty);
      return {
        type: UserPropertyAssignmentType.Standard,
        query: `last_value[${qb.addQueryValue(stateId, "String")}]`,
        stateIds: [stateId],
      };
    }
    case UserPropertyDefinitionType.Performed: {
      return leafUserPropertyToAssignment({
        userProperty,
        child: userProperty.definition,
        qb,
      });
    }
  }
}

export interface ComputePropertiesArgs {
  integrations: SavedIntegrationResource[];
  journeys: SavedHasStartedJourneyResource[];
  // timestamp in ms
  now: number;
  segments: SavedSegmentResource[];
  userProperties: SavedUserPropertyResource[];
  workspaceId: string;
}

export type PartialComputePropertiesArgs = Omit<
  ComputePropertiesArgs,
  "journeys" | "integrations"
>;

export async function computeState({
  workspaceId,
  segments,
  userProperties,
  now,
}: PartialComputePropertiesArgs) {
  return withSpan({ name: "compute-state" }, async (span) => {
    span.setAttribute("workspaceId", workspaceId);

    const qb = new ClickHouseQueryBuilder({
      debug:
        config().nodeEnv === NodeEnvEnum.Development ||
        config().nodeEnv === NodeEnvEnum.Test,
    });
    let subQueryData: FullSubQueryData[] = [];

    for (const segment of segments) {
      subQueryData = subQueryData.concat(
        segmentNodeToStateSubQuery({
          segment,
          node: segment.definition.entryNode,
          qb,
        }).map((subQuery) => ({
          ...subQuery,
          version: segment.definitionUpdatedAt.toString(),
        })),
      );
    }

    for (const userProperty of userProperties) {
      subQueryData = subQueryData.concat(
        userPropertyToSubQuery({
          userProperty,
          qb,
        }).map((subQuery) => ({
          ...subQuery,
          version: userProperty.definitionUpdatedAt.toString(),
        })),
      );
    }
    if (subQueryData.length === 0) {
      return;
    }

    const periodByComputedPropertyId = await getPeriodsByComputedPropertyId({
      workspaceId,
      step: ComputedPropertyStep.ComputeState,
    });

    const subQueriesWithPeriods = subQueryData.reduce<
      Map<number, SubQueryData[]>
    >((memo, subQuery) => {
      const period = periodByComputedPropertyId.get(subQuery) ?? null;
      const periodKey = period?.maxTo.getTime() ?? 0;
      const subQueriesForPeriod = memo.get(periodKey) ?? [];
      memo.set(periodKey, [...subQueriesForPeriod, subQuery]);
      return memo;
    }, new Map());

    const nowSeconds = now / 1000;
    const workspaceIdClause = qb.addQueryValue(workspaceId, "String");
    const queries = Array.from(subQueriesWithPeriods.entries()).map(
      async ([period, periodSubQueries]) => {
        const lowerBoundClause =
          period > 0
            ? `and processing_time >= toDateTime64(${period / 1000}, 3)`
            : ``;

        const subQueries = periodSubQueries
          .map(
            (subQuery) => `
              if(
                ${subQuery.condition},
                (
                  '${subQuery.type}',
                  '${subQuery.computedPropertyId}',
                  '${subQuery.stateId}',
                  ${subQuery.argMaxValue ?? "''"},
                  ${subQuery.uniqValue ?? "''"},
                  ${subQuery.recordMessageId ? "message_id" : "''"},
                  ${subQuery.eventTimeExpression ?? "toDateTime64('0000-00-00 00:00:00', 3)"}
                ),
                (Null, Null, Null, Null, Null, Null, Null)
              )
            `,
          )
          .join(", ");

        const joinedPrior = periodSubQueries.flatMap((subQuery) => {
          if (!subQuery.joinPriorStateValue) {
            return [];
          }
          return `
            (
              type = '${subQuery.type}'
              and computed_property_id = ${qb.addQueryValue(
                subQuery.computedPropertyId,
                "String",
              )}
              and state_id = ${qb.addQueryValue(subQuery.stateId, "String")}
            )
          `;
        });
        const priorLastValueClause = joinedPrior.length
          ? `
            AND (
                inner1.workspace_id,
                inner1.type,
                inner1.computed_property_id,
                inner1.state_id,
                inner1.user_id,
                inner1.last_value
            ) NOT IN (
              SELECT
                workspace_id,
                type,
                computed_property_id,
                state_id,
                user_id,
                argMaxMerge(last_value) as last_value
              FROM computed_property_state_v2
              WHERE
                workspace_id = ${workspaceIdClause}
                AND (${joinedPrior.join(" OR ")})
              GROUP BY
                  workspace_id,
                  type,
                  computed_property_id,
                  state_id,
                  user_id
            )
          `
          : "";

        const query = `
          insert into computed_property_state_v2
          select
            inner1.workspace_id as workspace_id,
            inner1.type as type,
            inner1.computed_property_id as computed_property_id,
            inner1.state_id as state_id,
            inner1.user_id as user_id,
            argMaxState(inner1.last_value, inner1.full_event_time) as last_value,
            uniqState(inner1.unique_count) as unique_count,
            inner1.truncated_event_time as truncated_event_time,
            groupArrayState(inner1.grouped_message_id) as grouped_message_ids,
            toDateTime64(${nowSeconds}, 3) as computed_at
          from (
            select
              workspace_id,
              CAST(
                (
                  arrayJoin(
                    arrayFilter(
                      v -> not(isNull(v.1)),
                      [${subQueries}]
                    )
                  ) as c
                ).1,
                'Enum8(\\'user_property\\' = 1, \\'segment\\' = 2)'
              ) as type,
              c.2 as computed_property_id,
              c.3 as state_id,
              user_id,
              ifNull(c.4, '') as last_value,
              ifNull(c.5, '') as unique_count,
              ifNull(c.6, '') as grouped_message_id,
              ifNull(c.7, toDateTime64('0000-00-00 00:00:00', 3)) as truncated_event_time,
              event_time as full_event_time
            from user_events_v2 ue
            where
              workspace_id = ${workspaceIdClause}
              and processing_time <= toDateTime64(${nowSeconds}, 3)
              ${lowerBoundClause}
          ) as inner1
          where
            inner1.unique_count != ''
            OR (inner1.grouped_message_id != '')
            OR (inner1.last_value != '' ${priorLastValueClause})
          group by
            inner1.workspace_id,
            inner1.type,
            inner1.computed_property_id,
            inner1.state_id,
            inner1.user_id,
            inner1.last_value,
            inner1.unique_count,
            inner1.grouped_message_id,
            inner1.truncated_event_time,
            inner1.full_event_time
        `;

        await command({
          query,
          query_params: qb.getQueries(),
          clickhouse_settings: {
            wait_end_of_query: 1,
            function_json_value_return_type_allow_complex: 1,
          },
        });
      },
    );
    await Promise.all(queries);

    await createPeriods({
      workspaceId,
      userProperties,
      segments,
      now,
      periodByComputedPropertyId,
      step: ComputedPropertyStep.ComputeState,
    });
  });
}

export async function computeAssignments({
  workspaceId,
  segments,
  userProperties,
  now,
}: PartialComputePropertiesArgs): Promise<void> {
  return withSpan({ name: "compute-assignments" }, async (span) => {
    span.setAttribute("workspaceId", workspaceId);

    const periodByComputedPropertyId = await getPeriodsByComputedPropertyId({
      workspaceId,
      step: ComputedPropertyStep.ComputeAssignments,
    });
    const queryValues: {
      queries: (string | string[])[];
      qb: ClickHouseQueryBuilder;
    }[] = [];

    for (const segment of segments) {
      const version = segment.definitionUpdatedAt.toString();
      const period = periodByComputedPropertyId.get({
        computedPropertyId: segment.id,
        version,
      });
      const periodBound = period?.maxTo.getTime();
      const qb = new ClickHouseQueryBuilder();

      const nowSeconds = now / 1000;

      const lowerBoundClause = getLowerBoundClause(periodBound);
      const indexedConfig = segmentToIndexed({
        segment,
        node: segment.definition.entryNode,
      });

      const resolvedQueries = segmentToResolvedState({
        segment,
        workspaceId,
        node: segment.definition.entryNode,
        now,
        qb,
        periodBound,
      });
      const assignmentConfig = resolvedSegmentToAssignment({
        segment,
        node: segment.definition.entryNode,
        qb,
      });
      const workspaceIdParam = qb.addQueryValue(workspaceId, "String");

      const segmentIdParam = qb.addQueryValue(segment.id, "String");
      const assignmentQueries = [
        `
        insert into computed_property_assignments_v2
        select
          workspace_id,
          'segment',
          segment_id,
          user_id,
          ${assignmentConfig.expression} as segment_value,
          '',
          max_state_event_time,
          toDateTime64(${nowSeconds}, 3) as assigned_at
        from (
          select
            workspace_id,
            segment_id,
            user_id,
            CAST((groupArray(state_id), groupArray(segment_state_value)), 'Map(String, Boolean)') as state_values,
            max(max_state_event_time) as max_state_event_time
          from  (
            select
              workspace_id,
              segment_id,
              state_id,
              user_id,
              argMax(segment_state_value, computed_at) segment_state_value,
              max(max_event_time) as max_state_event_time
            from resolved_segment_state
            where
              (
                workspace_id,
                segment_id,
              ) in (
                select
                  workspace_id,
                  segment_id
                from resolved_segment_state
                where
                  workspace_id = ${workspaceIdParam}
                  and segment_id = ${segmentIdParam}
                  and computed_at <= toDateTime64(${nowSeconds}, 3)
                  ${lowerBoundClause}
              )
              and state_id in ${qb.addQueryValue(
                assignmentConfig.stateIds,
                "Array(String)",
              )}
            group by
              workspace_id,
              segment_id,
              user_id,
              state_id
          )
          group by
            workspace_id,
            segment_id,
            user_id
        )
      `,
      ];

      if (
        segment.definitionUpdatedAt &&
        segment.definitionUpdatedAt <= now &&
        segment.definitionUpdatedAt >= (periodBound ?? 0) &&
        segment.definitionUpdatedAt > segment.createdAt
      ) {
        const resetQuery = `
          insert into computed_property_assignments_v2
          select
            workspace_id,
            'segment',
            computed_property_id,
            user_id,
            False as segment_value,
            '',
            max_event_time,
            toDateTime64(${nowSeconds}, 3) as assigned_at
          from computed_property_assignments_v2
          where
            workspace_id = ${workspaceIdParam}
            and type = 'segment'
            and computed_property_id = ${segmentIdParam}
        `;
        assignmentQueries.unshift(resetQuery);
      }

      const queries = [resolvedQueries, ...assignmentQueries];

      if (indexedConfig.length) {
        const indexQuery = `
          insert into computed_property_state_index
          select
            workspace_id,
            type,
            computed_property_id,
            state_id,
            user_id,
            multiIf(
              ${indexedConfig
                .map(
                  ({ stateId, expression }) =>
                    `state_id == ${qb.addQueryValue(
                      stateId,
                      "String",
                    )}, ${expression}`,
                )
                .join(",")},
              0
            ) indexed_value
          from computed_property_state_v2
          where
            workspace_id = ${workspaceIdParam}
            and type = 'segment'
            and computed_property_id = ${qb.addQueryValue(segment.id, "String")}
            and state_id in ${qb.addQueryValue(
              indexedConfig.map((c) => c.stateId),
              "Array(String)",
            )}
            and computed_at <= toDateTime64(${nowSeconds}, 3)
            ${lowerBoundClause}
          group by
            workspace_id,
            type,
            computed_property_id,
            state_id,
            user_id
        `;
        queries.unshift(indexQuery);
      }

      queryValues.push({
        queries,
        qb,
      });
    }

    for (const userProperty of userProperties) {
      const version = userProperty.definitionUpdatedAt.toString();
      const period = periodByComputedPropertyId.get({
        computedPropertyId: userProperty.id,
        version,
      });
      const qb = new ClickHouseQueryBuilder();
      const ac = userPropertyToAssignment({
        userProperty,
        qb,
      });
      if (!ac) {
        continue;
      }
      const stateQuery = assignUserPropertiesQuery({
        workspaceId,
        userPropertyId: userProperty.id,
        config: ac,
        qb,
        now,
        periodBound: period?.maxTo.getTime(),
      });
      if (!stateQuery) {
        continue;
      }
      queryValues.push({
        queries: [stateQuery],
        qb,
      });
    }

    await Promise.all(
      queryValues.map(async ({ queries, qb }) => {
        for (const query of queries) {
          if (Array.isArray(query)) {
            await Promise.all(
              query.map(async (q) => {
                await command({
                  query: q,
                  query_params: qb.getQueries(),
                  clickhouse_settings: { wait_end_of_query: 1 },
                });
              }),
            );
          } else {
            await command({
              query,
              query_params: qb.getQueries(),
              clickhouse_settings: { wait_end_of_query: 1 },
            });
          }
        }
      }),
    );

    await createPeriods({
      workspaceId,
      userProperties,
      segments,
      now,
      periodByComputedPropertyId,
      step: ComputedPropertyStep.ComputeAssignments,
    });
  });
}

async function processRows({
  rows,
  workspaceId,
  subscribedJourneys,
}: {
  rows: unknown[];
  workspaceId: string;
  subscribedJourneys: HasStartedJourneyResource[];
}): Promise<boolean> {
  logger().debug(
    {
      rows,
    },
    "processRows",
  );
  let hasRows = false;
  const assignments: ComputedAssignment[] = rows
    .map((json) => {
      const result = schemaValidateWithErr(json, ComputedAssignment);
      if (result.isErr()) {
        logger().error(
          { err: result.error, json },
          "failed to parse assignment json",
        );
        const emptyAssignments: ComputedAssignment[] = [];
        return emptyAssignments;
      }
      return result.value;
    })
    .flat();

  const pgUserPropertyAssignments: ComputedAssignment[] = [];
  const pgSegmentAssignments: ComputedAssignment[] = [];
  const journeySegmentAssignments: ComputedAssignment[] = [];
  const integrationAssignments: ComputedAssignment[] = [];

  for (const assignment of assignments) {
    hasRows = true;

    let assignmentCategory: ComputedAssignment[];
    if (assignment.processed_for_type === "pg") {
      switch (assignment.type) {
        case "segment":
          assignmentCategory = pgSegmentAssignments;
          break;
        case "user_property":
          assignmentCategory = pgUserPropertyAssignments;
          break;
      }
    } else if (assignment.processed_for_type === "integration") {
      assignmentCategory = integrationAssignments;
    } else {
      if (!assignment.latest_segment_value) {
        continue;
      }
      assignmentCategory = journeySegmentAssignments;
    }
    assignmentCategory.push(assignment);
  }

  logger().info(
    {
      workspaceId,
      assignmentsCount: assignments.length,
      pgUserPropertyAssignmentsCount: pgUserPropertyAssignments.length,
      pgSegmentAssignmentsCount: pgSegmentAssignments.length,
      journeySegmentAssignmentsCount: journeySegmentAssignments.length,
      integrationAssignmentsCount: integrationAssignments.length,
    },
    "processing computed assignments",
  );

  await Promise.all([
    upsertBulkUserPropertyAssignments({
      data: pgUserPropertyAssignments.map((a) => ({
        workspaceId: a.workspace_id,
        userId: a.user_id,
        userPropertyId: a.computed_property_id,
        value: a.latest_user_property_value,
      })),
    }),
    upsertBulkSegmentAssignments({
      data: pgSegmentAssignments.map((a) => ({
        workspaceId: a.workspace_id,
        userId: a.user_id,
        segmentId: a.computed_property_id,
        inSegment: a.latest_segment_value,
      })),
    }),
  ]);

  await Promise.all([
    ...journeySegmentAssignments.flatMap((assignment) => {
      const journey = subscribedJourneys.find(
        (j) => j.id === assignment.processed_for,
      );
      if (!journey) {
        logger().error(
          {
            subscribedJourneys: subscribedJourneys.map((j) => j.id),
            processed_for: assignment.processed_for,
          },
          "journey in assignment.processed_for missing from subscribed journeys",
        );
        return [];
      }

      return signalJourney({
        workspaceId,
        segmentId: assignment.computed_property_id,
        segmentAssignment: assignment,
        journey,
      });
    }),
    ...integrationAssignments.flatMap(async (assignment) => {
      switch (assignment.processed_for) {
        case HUBSPOT_INTEGRATION: {
          const { workflowClient } = getContext();
          const updateVersion = new Date(assignment.max_assigned_at).getTime();

          const update: ComputedPropertyUpdate =
            assignment.type === "segment"
              ? {
                  type: "segment",
                  segmentId: assignment.computed_property_id,
                  segmentVersion: updateVersion,
                  currentlyInSegment: assignment.latest_segment_value,
                }
              : {
                  type: "user_property",
                  userPropertyId: assignment.computed_property_id,
                  value: assignment.latest_user_property_value,
                  userPropertyVersion: updateVersion,
                };

          return startHubspotUserIntegrationWorkflow({
            workspaceId: assignment.workspace_id,
            userId: assignment.user_id,
            workflowClient,
            update,
          });
        }
        default:
          logger().error(
            {
              workspaceId,
              assignment,
            },
            "integration in assignment.processed_for missing from subscribed integrations",
          );
          return [];
      }
    }),
  ]);

  const processedAssignments: ComputedPropertyAssignment[] =
    assignments.flatMap((assignment) => ({
      user_property_value: assignment.latest_user_property_value,
      segment_value: assignment.latest_segment_value,
      ...assignment,
    }));

  await insertProcessedComputedProperties({
    assignments: processedAssignments,
  });
  return hasRows;
}

export async function processAssignments({
  workspaceId,
  userProperties,
  segments,
  integrations,
  journeys,
  now,
}: ComputePropertiesArgs): Promise<void> {
  return withSpan({ name: "process-assignments" }, async (span) => {
    span.setAttribute("workspaceId", workspaceId);

    // segment id / pg + journey id
    const subscribedJourneyMap = journeys.reduce<Map<string, Set<string>>>(
      (memo, j) => {
        const subscribedSegments = getSubscribedSegments(j.definition);

        subscribedSegments.forEach((segmentId) => {
          const processFor = memo.get(segmentId) ?? new Set();
          processFor.add(j.id);
          memo.set(segmentId, processFor);
        });
        return memo;
      },
      new Map(),
    );

    const subscribedIntegrationUserPropertyMap = integrations.reduce<
      Map<string, Set<string>>
    >((memo, integration) => {
      integration.definition.subscribedUserProperties.forEach(
        (userPropertyName) => {
          const userPropertyId = userProperties.find(
            (up) => up.name === userPropertyName,
          )?.id;
          if (!userPropertyId) {
            logger().info(
              { workspaceId, integration, userPropertyName },
              "integration subscribed to user property that doesn't exist",
            );
            return;
          }
          const processFor = memo.get(userPropertyId) ?? new Set();
          processFor.add(integration.name);
          memo.set(userPropertyId, processFor);
        },
      );
      return memo;
    }, new Map());

    const subscribedIntegrationSegmentMap = integrations.reduce<
      Map<string, Set<string>>
    >((memo, integration) => {
      integration.definition.subscribedSegments.forEach((segmentName) => {
        const segmentId = segments.find((s) => s.name === segmentName)?.id;
        if (!segmentId) {
          logger().info(
            { workspaceId, integration, segmentName },
            "integration subscribed to segment that doesn't exist",
          );
          return;
        }
        const processFor = memo.get(segmentId) ?? new Set();
        processFor.add(integration.name);
        memo.set(segmentId, processFor);
      });
      return memo;
    }, new Map());

    const subscribedJourneyKeys: string[] = [];
    const subscribedJourneyValues: string[][] = [];
    const subscribedIntegrationUserPropertyKeys: string[] = [];
    const subscribedIntegrationUserPropertyValues: string[][] = [];
    const subscribedIntegrationSegmentKeys: string[] = [];
    const subscribedIntegrationSegmentValues: string[][] = [];

    for (const [segmentId, journeySet] of Array.from(subscribedJourneyMap)) {
      subscribedJourneyKeys.push(segmentId);
      subscribedJourneyValues.push(Array.from(journeySet));
    }

    for (const [segmentId, integrationSet] of Array.from(
      subscribedIntegrationSegmentMap,
    )) {
      subscribedIntegrationSegmentKeys.push(segmentId);
      subscribedIntegrationSegmentValues.push(Array.from(integrationSet));
    }

    for (const [userPropertyId, integrationSet] of Array.from(
      subscribedIntegrationUserPropertyMap,
    )) {
      subscribedIntegrationUserPropertyKeys.push(userPropertyId);
      subscribedIntegrationUserPropertyValues.push(Array.from(integrationSet));
    }

    const qb = new ClickHouseQueryBuilder();

    const subscribedJourneysKeysQuery = qb.addQueryValue(
      subscribedJourneyKeys,
      "Array(String)",
    );

    const subscribedJourneysValuesQuery = qb.addQueryValue(
      subscribedJourneyValues,
      "Array(Array(String))",
    );

    const subscribedIntegrationsUserPropertyKeysQuery = qb.addQueryValue(
      subscribedIntegrationUserPropertyKeys,
      "Array(String)",
    );

    const subscribedIntegrationsUserPropertyValuesQuery = qb.addQueryValue(
      subscribedIntegrationUserPropertyValues,
      "Array(Array(String))",
    );

    const subscribedIntegrationsSegmentKeysQuery = qb.addQueryValue(
      subscribedIntegrationSegmentKeys,
      "Array(String)",
    );

    const subscribedIntegrationsSegmentValuesQuery = qb.addQueryValue(
      subscribedIntegrationSegmentValues,
      "Array(Array(String))",
    );

    const workspaceIdParam = qb.addQueryValue(workspaceId, "String");

    /**
     * This query is a bit complicated, so here's a breakdown of what it does:
     *
     * 1. It reads all the computed property assignments for the workspace.
     * 2. It joins the computed property assignments with the processed computed
     * properties table to filter out assignments that have already been
     * processed.
     * 3. It filters out "empty assignments" (assignments where the user property
     * value is empty, or the segment value is false) if the property has not
     * already been assigned.
     * 4. It filters out false segment assignments to journeys.
     */
    const selectQuery = `
    SELECT
      cpa.workspace_id,
      cpa.type,
      cpa.computed_property_id,
      cpa.user_id,
      cpa.latest_segment_value,
      cpa.latest_user_property_value,
      cpa.max_assigned_at,
      cpa.processed_for,
      cpa.processed_for_type
    FROM (
      SELECT
          workspace_id,
          type,
          computed_property_id,
          user_id,
          argMax(segment_value, assigned_at) latest_segment_value,
          argMax(user_property_value, assigned_at) latest_user_property_value,
          max(assigned_at) max_assigned_at,
          arrayJoin(
              arrayConcat(
                  if(
                      type = 'segment' AND indexOf(${subscribedJourneysKeysQuery}, computed_property_id) > 0,
                      arrayMap(i -> ('journey', i), arrayElement(${subscribedJourneysValuesQuery}, indexOf(${subscribedJourneysKeysQuery}, computed_property_id))),
                      []
                  ),
                  if(
                      type = 'user_property' AND indexOf(${subscribedIntegrationsUserPropertyKeysQuery}, computed_property_id) > 0,
                      arrayMap(i -> ('integration', i), arrayElement(${subscribedIntegrationsUserPropertyValuesQuery}, indexOf(${subscribedIntegrationsUserPropertyKeysQuery}, computed_property_id))),
                      []
                  ),
                  if(
                      type = 'segment' AND indexOf(${subscribedIntegrationsSegmentKeysQuery}, computed_property_id) > 0,
                      arrayMap(i -> ('integration', i), arrayElement(${subscribedIntegrationsSegmentValuesQuery}, indexOf(${subscribedIntegrationsSegmentKeysQuery}, computed_property_id))),
                      []
                  ),
                  [('pg', 'pg')]
              )
          ) as processed,
          processed.1 as processed_for_type,
          processed.2 as processed_for
      FROM computed_property_assignments_v2
      WHERE workspace_id = ${workspaceIdParam}
      GROUP BY
          workspace_id,
          type,
          computed_property_id,
          user_id
    ) cpa
    LEFT JOIN (
      SELECT
        workspace_id,
        computed_property_id,
        user_id,
        processed_for_type,
        processed_for,
        argMax(segment_value, processed_at) segment_value,
        argMax(user_property_value, processed_at) user_property_value
      FROM processed_computed_properties_v2
      GROUP BY
        workspace_id,
        computed_property_id,
        user_id,
        processed_for_type,
        processed_for
    ) pcp
    ON
      cpa.workspace_id = pcp.workspace_id AND
      cpa.computed_property_id = pcp.computed_property_id AND
      cpa.user_id = pcp.user_id AND
      cpa.processed_for = pcp.processed_for AND
      cpa.processed_for_type = pcp.processed_for_type
    WHERE (
      cpa.latest_user_property_value != pcp.user_property_value
      OR cpa.latest_segment_value != pcp.segment_value
    )
    AND (
        (
            cpa.type = 'user_property'
            AND cpa.latest_user_property_value != '""'
            AND cpa.latest_user_property_value != ''
        )
        OR (
            cpa.type = 'segment'
            AND cpa.latest_segment_value = true
        )
        OR (
            pcp.workspace_id != ''
        )
    )
  `;

    const pageQueryId = getChCompatibleUuid();

    const resultSet = await chQuery({
      query: selectQuery,
      query_id: pageQueryId,
      query_params: qb.getQueries(),
      format: "JSONEachRow",
      clickhouse_settings: { wait_end_of_query: 1 },
    });

    let rowsProcessed = 0;
    try {
      await streamClickhouseQuery(resultSet, async (rows) => {
        rowsProcessed += rows.length;
        await processRows({
          rows,
          workspaceId,
          subscribedJourneys: journeys,
        });
      });
    } catch (e) {
      logger().error(
        {
          err: e,
          pageQueryId,
        },
        "failed to process rows",
      );
    }
    span.setAttribute("rowsProcessed", rowsProcessed);

    // TODO encorporate existing periods into query
    const periodByComputedPropertyId = await getPeriodsByComputedPropertyId({
      workspaceId,
      step: ComputedPropertyStep.ProcessAssignments,
    });

    await createPeriods({
      workspaceId,
      userProperties,
      segments,
      now,
      periodByComputedPropertyId,
      step: ComputedPropertyStep.ProcessAssignments,
    });
  });
}
