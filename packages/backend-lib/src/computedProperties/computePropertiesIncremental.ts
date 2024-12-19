/* eslint-disable no-await-in-loop */

import { Counter } from "@opentelemetry/api";
import { toJsonPathParam } from "isomorphic-lib/src/jsonPath";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { getStringBeforeAsterisk } from "isomorphic-lib/src/strings";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { fileUserPropertyToPerformed } from "isomorphic-lib/src/userProperties";
import pLimit, { Limit } from "p-limit";
import { v5 as uuidv5, validate as validateUuid } from "uuid";

import {
  ClickHouseQueryBuilder,
  command,
  getChCompatibleUuid,
  query as chQuery,
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
import { getMeter, withSpan, withSpanSync } from "../openTelemetry";
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
  PerformedSegmentNode,
  RelationalOperators,
  SavedHasStartedJourneyResource,
  SavedIntegrationResource,
  SavedSegmentResource,
  SavedUserPropertyResource,
  SegmentHasBeenOperatorComparator,
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
import {
  createPeriods,
  getPeriodsByComputedPropertyId,
  PeriodByComputedPropertyId,
} from "./periods";

let READ_LIMIT: Limit | null = null;

function readLimit(): Limit {
  if (!READ_LIMIT) {
    const concurrency = config().readQueryConcurrency;
    const newLimit = pLimit(concurrency);
    READ_LIMIT = newLimit;
    return newLimit;
  }
  return READ_LIMIT;
}

/**
 * Use to round event timestamps to the nearest interval, to reduce the
 * cardinality of the data
 * @param windowSeconds
 * @returns
 */
function getEventTimeInterval(windowSeconds: number): number {
  // Window data within 1 / 10th of the specified period, with a minumum
  // window of 30 seconds, and a maximum window of 1 day.
  return Math.min(Math.max(Math.floor(windowSeconds / 10), 1), 86400);
}

export function userPropertyStateId(
  userProperty: SavedUserPropertyResource,
  nodeId = "",
): string | null {
  if (!validateUuid(userProperty.id)) {
    logger().error(
      {
        userProperty,
      },
      "Invalid user property id, not a valid v4 UUID",
    );
    return null;
  }
  const stateId = uuidv5(
    `${userProperty.definitionUpdatedAt.toString()}:${nodeId}`,
    userProperty.id,
  );
  return stateId;
}

function getPrefixCondition({
  column,
  value,
  qb,
}: {
  column: string;
  value: string;
  qb: ClickHouseQueryBuilder;
}): string | null {
  if (value.length === 0 || value === "*") {
    return null;
  }
  const prefix = getStringBeforeAsterisk(value);
  if (!prefix) {
    return `${column} = ${qb.addQueryValue(value, "String")}`;
  }
  return `startsWithUTF8(${column}, ${qb.addQueryValue(prefix, "String")})`;
}

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
): string | null {
  if (!validateUuid(segment.id)) {
    logger().error(
      {
        segment,
      },
      "Invalid segment id, not a valid v4 UUID",
    );
    return null;
  }
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
      if (!stateId) {
        return [];
      }

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
  idUserProperty,
}: {
  workspaceId: string;
  segment: SavedSegmentResource;
  now: number;
  node: SegmentNode;
  periodBound?: number;
  qb: ClickHouseQueryBuilder;
  idUserProperty?: SavedUserPropertyResource;
}): string[] {
  const nowSeconds = now / 1000;
  const stateId = segmentNodeStateId(segment, node.id);
  if (!stateId) {
    return [];
  }
  switch (node.type) {
    case SegmentNodeType.Performed: {
      const operator: RelationalOperators =
        node.timesOperator ?? RelationalOperators.Equals;
      const times = node.times === undefined ? 1 : node.times;

      const segmentIdParam = qb.addQueryValue(segment.id, "String");
      const stateIdParam = qb.addQueryValue(stateId, "String");
      const workspaceIdParam = qb.addQueryValue(workspaceId, "String");

      const userIdStateParam = idUserProperty
        ? qb.addQueryValue(userPropertyStateId(idUserProperty), "String")
        : null;

      const userIdPropertyIdParam = idUserProperty
        ? qb.addQueryValue(idUserProperty.id, "String")
        : null;

      const checkZeroValue =
        ((operator === RelationalOperators.Equals && times === 0) ||
          operator === RelationalOperators.LessThan) &&
        userIdStateParam &&
        userIdPropertyIdParam;

      const checkGreaterThanZeroValue = !(
        operator === RelationalOperators.Equals && times === 0
      );

      if (node.withinSeconds && node.withinSeconds > 0) {
        const withinRangeWhereClause = `
          cps_performed.workspace_id = ${workspaceIdParam}
          and cps_performed.type = 'segment'
          and cps_performed.computed_property_id = ${segmentIdParam}
          and cps_performed.state_id = ${stateIdParam}
          and cps_performed.event_time >= toDateTime64(${Math.round(
            Math.max(nowSeconds - node.withinSeconds, 0),
          )}, 3)
        `;

        const queries: string[] = [];

        if (checkGreaterThanZeroValue) {
          // insert False into resolved_segment_state for all users who are in
          // the segment and are not in the latest window. allows users to exit
          // the segment after the window has expired
          const expiredQuery = `
            insert into resolved_segment_state
            select
              workspace_id,
              segment_id,
              state_id,
              user_id,
              False,
              max_event_time,
              toDateTime64(${nowSeconds}, 3)
            from resolved_segment_state as rss
            where
              rss.workspace_id = ${workspaceIdParam}
              and rss.segment_id = ${segmentIdParam}
              and rss.state_id = ${stateIdParam}
              and rss.segment_state_value = True
              and (
                workspace_id,
                segment_id,
                state_id,
                user_id,
                True
              ) not in (
                select
                  workspace_id,
                  computed_property_id,
                  state_id,
                  user_id,
                  uniqMerge(cps_performed.unique_count) ${operator} ${times} as segment_state_value
                from computed_property_state_v2 cps_performed
                where
                  ${withinRangeWhereClause}
                group by
                  workspace_id,
                  computed_property_id,
                  state_id,
                  user_id
                having
                  segment_state_value = True
              )
          `;
          queries.push(expiredQuery);

          // set to true all users who satisfy the condition in the latest window
          const greaterThanZeroQuery = `
            insert into resolved_segment_state
            select
              workspace_id,
              computed_property_id,
              state_id,
              user_id,
              uniqMerge(cps_performed.unique_count) ${operator} ${times} as segment_state_value,
              max(cps_performed.event_time) as max_event_time,
              toDateTime64(${nowSeconds}, 3)
            from computed_property_state_v2 cps_performed
            where ${withinRangeWhereClause}
            group by
              workspace_id,
              computed_property_id,
              state_id,
              user_id
          `;
          queries.push(greaterThanZeroQuery);
        }
        if (checkZeroValue) {
          const zeroTimesQuery = `
            insert into resolved_segment_state
            select
              np.workspace_id,
              ${segmentIdParam},
              ${stateIdParam},
              np.user_id,
              True,
              np.max_event_time,
              toDateTime64(${nowSeconds}, 3)
            from (
              select
                workspace_id,
                user_id,
                argMaxMerge(last_value) last_id,
                max(cps.event_time) as max_event_time
              from computed_property_state_v2 cps
              where
                cps.workspace_id = ${workspaceIdParam}
                and cps.type = 'user_property'
                and cps.computed_property_id = ${userIdPropertyIdParam}
                and cps.state_id = ${userIdStateParam}
                and (
                  cps.user_id
                ) not in (
                  select user_id
                  from (
                    select
                      workspace_id,
                      computed_property_id,
                      state_id,
                      user_id
                    from computed_property_state_v2 as cps_performed
                    where ${withinRangeWhereClause}
                    group by
                      workspace_id,
                      computed_property_id,
                      state_id,
                      user_id
                  )
                )
                and (
                  cps.user_id
                ) not in (
                  select user_id from resolved_segment_state as rss
                  where
                    rss.workspace_id = ${workspaceIdParam}
                    and rss.segment_id = ${segmentIdParam}
                    and rss.state_id = ${stateIdParam}
                    and rss.segment_state_value = True
                )
              group by
                workspace_id,
                user_id
            ) as np`;
          queries.push(zeroTimesQuery);
        }

        return queries;
      }
      const queries: string[] = [];
      if (checkGreaterThanZeroValue) {
        queries.push(
          buildRecentUpdateSegmentQuery({
            segmentId: segment.id,
            periodBound,
            now,
            workspaceId,
            stateId,
            expression: `uniqMerge(cps.unique_count) ${operator} ${times} as segment_state_value`,
            qb,
          }),
        );
      }
      if (checkZeroValue) {
        const lowerBoundClause = getLowerBoundClause(periodBound);

        const zeroTimesQuery = `
          insert into resolved_segment_state
          select
            np.workspace_id,
            ${segmentIdParam},
            ${stateIdParam},
            np.user_id,
            True,
            np.max_event_time,
            toDateTime64(${nowSeconds}, 3)
          from (
            select
              workspace_id,
              user_id,
              argMaxMerge(last_value) last_id,
              max(cps.event_time) as max_event_time
            from computed_property_state_v2 cps
            where
              cps.workspace_id = ${workspaceIdParam}
              and cps.type = 'user_property'
              and cps.computed_property_id = ${userIdPropertyIdParam}
              and cps.state_id = ${userIdStateParam}
              and (
                cps.user_id
              ) not in (
                select user_id
                from (
                  select
                    workspace_id,
                    computed_property_id,
                    state_id,
                    user_id
                  from computed_property_state_v2 as cps_performed
                  where
                    workspace_id = ${qb.addQueryValue(workspaceId, "String")}
                    and type = 'segment'
                    and computed_property_id = ${qb.addQueryValue(segment.id, "String")}
                    and state_id = ${qb.addQueryValue(stateId, "String")}
                    and computed_at <= toDateTime64(${nowSeconds}, 3)
                    ${lowerBoundClause}
                  group by
                    workspace_id,
                    computed_property_id,
                    state_id,
                    user_id
                )
              )
              and (
                cps.user_id
              ) not in (
                select user_id from resolved_segment_state as rss
                where
                  rss.workspace_id = ${workspaceIdParam}
                  and rss.segment_id = ${segmentIdParam}
                  and rss.state_id = ${stateIdParam}
                  and rss.segment_state_value = True
              )
            group by
              workspace_id,
              user_id
          ) as np`;
        queries.push(zeroTimesQuery);
      }
      return queries;
    }
    case SegmentNodeType.Trait: {
      const { operator } = node;
      switch (operator.type) {
        case SegmentOperatorType.Within: {
          const withinLowerBound = Math.round(
            Math.max(nowSeconds - operator.windowSeconds, 0),
          );
          const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
          const computedPropertyIdParam = qb.addQueryValue(
            segment.id,
            "String",
          );
          const stateIdParam = qb.addQueryValue(stateId, "String");
          const queries: string[] = [];

          // remove users who are no longer in the segment
          const expiringEntrantsQuery = `
            insert into resolved_segment_state
            select
              rss.workspace_id,
              rss.segment_id,
              rss.state_id,
              rss.user_id,
              False,
              rss.max_event_time,
              toDateTime64(${nowSeconds}, 3) as assigned_at
            from resolved_segment_state as rss
            where
              rss.workspace_id = ${workspaceIdParam}
              and rss.segment_id = ${computedPropertyIdParam}
              and rss.state_id = ${stateIdParam}
              and rss.segment_state_value = True
              and (
                rss.workspace_id,
                rss.segment_id,
                rss.state_id,
                rss.user_id,
                True
              ) not in (
                select
                  cpsi.workspace_id,
                  cpsi.computed_property_id,
                  cpsi.state_id,
                  cpsi.user_id,
                  indexed_value >= ${qb.addQueryValue(withinLowerBound, "Int32")} as segment_state_value
                from computed_property_state_index cpsi
                where
                  segment_state_value = True
                  and cpsi.workspace_id = ${workspaceIdParam}
                  and cpsi.type = 'segment'
                  and cpsi.computed_property_id = ${computedPropertyIdParam}
                  and cpsi.state_id = ${stateIdParam}
              )
          `;
          queries.push(expiringEntrantsQuery);

          // add users who are now in the segment
          const newEntrantsQuery = `
            insert into resolved_segment_state
            select
              cpsi.workspace_id,
              cpsi.computed_property_id,
              cpsi.state_id,
              cpsi.user_id,
              True,
              toDateTime64(indexed_value, 3),
              toDateTime64(${nowSeconds}, 3) as assigned_at
            from computed_property_state_index cpsi
            where
              indexed_value >= ${qb.addQueryValue(withinLowerBound, "Int32")}
              and cpsi.workspace_id = ${workspaceIdParam}
              and cpsi.type = 'segment'
              and cpsi.computed_property_id = ${computedPropertyIdParam}
              and cpsi.state_id = ${stateIdParam}
          `;
          queries.push(newEntrantsQuery);
          return queries;
        }
        case SegmentOperatorType.HasBeen: {
          const windowBound = Math.max(nowSeconds - operator.windowSeconds, 0);

          const boundInterval = getEventTimeInterval(operator.windowSeconds);

          const upperBoundClause = `and cpsi.indexed_value <= ${qb.addQueryValue(Math.ceil(nowSeconds), "Int64")}`;

          let lowerBoundClause = "";
          if (periodBound && periodBound > 0) {
            const periodBoundSeconds = periodBound / 1000;
            lowerBoundClause = `and cpsi.indexed_value >= toUnixTimestamp(toStartOfInterval(toDateTime64(${periodBoundSeconds}, 3), INTERVAL ${boundInterval} SECOND))`;
          }
          const lastValueParam = qb.addQueryValue(operator.value, "String");

          const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
          const computedPropertyIdParam = qb.addQueryValue(
            segment.id,
            "String",
          );
          const stateIdParam = qb.addQueryValue(stateId, "String");
          // comparators are seemingly reversed because we're dealing with times
          // in the past
          const comparator =
            operator.comparator === SegmentHasBeenOperatorComparator.GTE
              ? "<="
              : ">";

          const windowBoundClause = `and cpsi.indexed_value ${comparator} toUnixTimestamp(toStartOfInterval(toDateTime64(${windowBound}, 3), INTERVAL ${boundInterval} SECOND))`;

          const queries: string[] = [];

          // expiring entrants
          // 1. look for all segment state values which are currently true
          // 2. look for all segment index values which don't satisfy the
          // operator window condition
          const expiredQuery = `
            insert into resolved_segment_state
            select
              cps.workspace_id,
              cps.computed_property_id,
              cps.state_id,
              cps.user_id,
              False,
              max(cps.event_time),
              toDateTime64(${nowSeconds}, 3) as assigned_at
            from computed_property_state_v2 as cps
            where
              cps.workspace_id = ${workspaceIdParam}
              and cps.type = 'segment'
              and cps.computed_property_id = ${computedPropertyIdParam}
              and cps.state_id = ${stateIdParam}
              and (
                cps.user_id
              ) in (
                select
                  rss.user_id,
                from resolved_segment_state as rss
                where
                  rss.workspace_id = ${workspaceIdParam}
                  and rss.segment_id = ${computedPropertyIdParam}
                  and rss.state_id = ${stateIdParam}
                  and rss.segment_state_value = True
              )
              and (
                cps.user_id
              ) not in (
                select
                  cpsi.user_id,
                from computed_property_state_index cpsi
                where
                  cpsi.workspace_id = ${workspaceIdParam}
                  and cpsi.type = 'segment'
                  and cpsi.computed_property_id = ${computedPropertyIdParam}
                  and cpsi.state_id = ${stateIdParam}
                  ${windowBoundClause}
              )
            group by
              cps.workspace_id,
              cps.computed_property_id,
              cps.state_id,
              cps.user_id
          `;
          queries.push(expiredQuery);

          // updated out of segment
          // 1. look for all resolved segment state values which are currently
          // true
          // 2. look for segments whose values changed in the current period
          // 3. check that they don't satisfy the last value condition
          const changedValueQuery = `
            insert into resolved_segment_state
            select
              cps.workspace_id,
              cps.computed_property_id,
              cps.state_id,
              cps.user_id,
              False,
              max(cps.event_time),
              toDateTime64(${nowSeconds}, 3) as assigned_at
            from computed_property_state_v2 as cps
            where
              cps.workspace_id = ${workspaceIdParam}
              and cps.type = 'segment'
              and cps.computed_property_id = ${computedPropertyIdParam}
              and cps.state_id = ${stateIdParam}
              and (
                cps.user_id
              ) in (
                select
                  cpsi.user_id,
                from computed_property_state_index cpsi
                where
                  cpsi.workspace_id = ${workspaceIdParam}
                  and cpsi.type = 'segment'
                  and cpsi.computed_property_id = ${computedPropertyIdParam}
                  and cpsi.state_id = ${stateIdParam}
                  ${upperBoundClause}
                  ${lowerBoundClause}
              )
            group by
              cps.workspace_id,
              cps.computed_property_id,
              cps.state_id,
              cps.user_id
            having
              argMaxMerge(last_value) != ${lastValueParam}
          `;
          queries.push(changedValueQuery);

          // new entrants
          // 1. look for all segment index values which satisfy the operator
          // window condition
          // 2. look for all resolved state values with matching string values
          // 3. group state values, and select only those with matching values
          const newEntrantsQuery = `
            insert into resolved_segment_state
            select
              cps.workspace_id,
              cps.computed_property_id,
              cps.state_id,
              cps.user_id,
              True,
              max(cps.event_time),
              toDateTime64(${nowSeconds}, 3) as assigned_at
            from computed_property_state_v2 as cps
            where
              cps.workspace_id = ${workspaceIdParam}
              and cps.type = 'segment'
              and cps.computed_property_id = ${computedPropertyIdParam}
              and cps.state_id = ${stateIdParam}
              and (
                cps.user_id
              ) in (
                select
                  cpsi.user_id,
                from computed_property_state_index cpsi
                where
                  cpsi.workspace_id = ${workspaceIdParam}
                  and cpsi.type = 'segment'
                  and cpsi.computed_property_id = ${computedPropertyIdParam}
                  and cpsi.state_id = ${stateIdParam}
                  ${windowBoundClause}
              )
            group by
              cps.workspace_id,
              cps.computed_property_id,
              cps.state_id,
              cps.user_id
            having
              argMaxMerge(last_value) == ${lastValueParam}
          `;
          queries.push(newEntrantsQuery);
          return queries;
        }
        case SegmentOperatorType.Equals: {
          return [
            buildRecentUpdateSegmentQuery({
              workspaceId,
              stateId,
              expression: `toString(argMaxMerge(last_value)) == ${qb.addQueryValue(
                operator.value,
                "String",
              )}`,
              segmentId: segment.id,
              now,
              periodBound,
              qb,
            }),
          ];
        }
        case SegmentOperatorType.GreaterThanOrEqual: {
          const varName = qb.getVariableName();
          return [
            buildRecentUpdateSegmentQuery({
              workspaceId,
              stateId,
              expression: `(toFloat64OrNull(argMaxMerge(last_value)) as ${varName}) is not Null and assumeNotNull(${varName}) >= ${qb.addQueryValue(
                operator.value,
                "Float64",
              )}`,
              segmentId: segment.id,
              now,
              periodBound,
              qb,
            }),
          ];
        }
        case SegmentOperatorType.LessThan: {
          const varName = qb.getVariableName();
          return [
            buildRecentUpdateSegmentQuery({
              workspaceId,
              stateId,
              expression: `(toFloat64OrNull(argMaxMerge(last_value)) as ${varName}) is not Null and assumeNotNull(${varName}) < ${qb.addQueryValue(
                operator.value,
                "Float64",
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
              expression: `toString(argMaxMerge(last_value)) != ${qb.addQueryValue(
                operator.value,
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
        case SegmentOperatorType.NotExists: {
          return [
            buildRecentUpdateSegmentQuery({
              workspaceId,
              stateId,
              // We use the stateId as a placeholder string to allow NotExists to
              // select empty values. No real danger of collisions given that
              // stateId is a uuid.
              expression: `argMaxMerge(last_value) == ${qb.addQueryValue(
                stateId,
                "String",
              )}`,
              segmentId: segment.id,
              now,
              periodBound,
              qb,
            }),
          ];
        }
        default:
          assertUnreachable(operator);
          break;
      }
      break;
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
          idUserProperty,
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
          idUserProperty,
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
        idUserProperty,
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
        idUserProperty,
        qb,
      });
    }
    case SegmentNodeType.LastPerformed: {
      const varName = qb.getVariableName();
      const hasPropertyConditions =
        node.hasProperties?.flatMap((property, i) => {
          const operatorType = property.operator.type;
          const reference =
            i === 0
              ? `(JSONExtract(argMaxMerge(last_value), 'Array(String)') as ${varName})`
              : varName;
          const indexedReference = `${reference}[${i + 1}]`;

          switch (operatorType) {
            case SegmentOperatorType.Equals: {
              return `toString(${indexedReference}) == ${qb.addQueryValue(
                String(property.operator.value),
                "String",
              )}`;
            }
            case SegmentOperatorType.NotEquals: {
              return `toString(${indexedReference}) != ${qb.addQueryValue(
                String(property.operator.value),
                "String",
              )}`;
            }
            case SegmentOperatorType.GreaterThanOrEqual: {
              const operatorVarName = qb.getVariableName();
              return `(toFloat64OrNull(${indexedReference}) as ${operatorVarName}) is not Null and assumeNotNull(${operatorVarName}) >= ${qb.addQueryValue(
                property.operator.value,
                "Float64",
              )}`;
            }
            case SegmentOperatorType.LessThan: {
              const operatorVarName = qb.getVariableName();
              return `(toFloat64OrNull(${indexedReference}) as ${operatorVarName}) is not Null and assumeNotNull(${operatorVarName}) < ${qb.addQueryValue(
                property.operator.value,
                "Float64",
              )}`;
            }
            case SegmentOperatorType.Exists: {
              return `${indexedReference} != ''`;
            }
            case SegmentOperatorType.NotExists: {
              return `${indexedReference} == ''`;
            }
            default:
              throw new Error(
                `Unimplemented segment operator for performed node ${operatorType} for segment: ${segment.id} and node: ${node.id}`,
              );
          }
        }) ?? [];
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
        idUserProperty,
        qb,
      });
    }
    case SegmentNodeType.RandomBucket: {
      const lowerBoundClause = getLowerBoundClause(periodBound);

      const userIdStateParam = idUserProperty
        ? qb.addQueryValue(userPropertyStateId(idUserProperty), "String")
        : null;

      const userIdPropertyIdParam = idUserProperty
        ? qb.addQueryValue(idUserProperty.id, "String")
        : null;

      if (!userIdStateParam || !userIdPropertyIdParam) {
        throw new Error(
          "User ID state and property ID are required for random bucket segments",
        );
      }
      const stateIdParam = qb.addQueryValue(stateId, "String");
      const segmentIdParam = qb.addQueryValue(segment.id, "String");
      // using name instead of id so that can be deterministically tested
      const segmentNameParam = qb.addQueryValue(segment.name, "String");

      const query = `
        insert into resolved_segment_state
        select
          workspace_id,
          ${segmentIdParam},
          ${stateIdParam},
          user_id,
          reinterpretAsUInt64(reverse(unhex(left(hex(MD5(concat(user_id, ${segmentNameParam}))), 16)))) < (${qb.addQueryValue(node.percent, "Float64")} * pow(2, 64)),
          max(event_time),
          toDateTime64(${nowSeconds}, 3) as assigned_at
        from computed_property_state_v2 as cps
        where
          (
            workspace_id,
            user_id
          ) in (
            select
              workspace_id,
              user_id
            from updated_computed_property_state
            where
              workspace_id = ${qb.addQueryValue(workspaceId, "String")}
              and type = 'user_property'
              and computed_property_id = ${userIdPropertyIdParam}
              and state_id = ${userIdStateParam}
              and computed_at <= toDateTime64(${nowSeconds}, 3)
              ${lowerBoundClause}
          )
        group by
          workspace_id,
          computed_property_id,
          state_id,
          user_id
      `;
      return [query];
    }
    case SegmentNodeType.KeyedPerformed: {
      return [];
    }
    case SegmentNodeType.Everyone: {
      return [
        buildRecentUpdateSegmentQuery({
          workspaceId,
          stateId,
          expression: `True`,
          segmentId: segment.id,
          now,
          periodBound,
          qb,
        }),
      ];
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
  if (!stateId) {
    return {
      stateIds: [],
      expression: "False",
    };
  }
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
    case SegmentNodeType.RandomBucket: {
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
    case SegmentNodeType.KeyedPerformed: {
      return {
        stateIds: [],
        expression: "False",
      };
    }
    case SegmentNodeType.Everyone: {
      return {
        stateIds: [stateId],
        expression: "True",
      };
    }
    default:
      assertUnreachable(node);
  }
}

function toJsonPathParamCh({
  path,
  qb,
}: {
  path: string;
  qb: ClickHouseQueryBuilder;
}): string | null {
  const normalizedPath = toJsonPathParam({ path });
  if (normalizedPath.isErr()) {
    logger().info(
      {
        path,
        err: normalizedPath.error,
      },
      "invalid json path in node path",
    );
    return null;
  }

  return qb.addQueryValue(normalizedPath.value, "String");
}

function truncateEventTimeExpression(windowSeconds: number): string {
  const eventTimeInterval = getEventTimeInterval(windowSeconds);
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
      if (!stateId) {
        return [];
      }
      const path = toJsonPathParamCh({
        path: node.path,
        qb,
      });
      if (!path) {
        return [];
      }
      if (
        node.operator.type === SegmentOperatorType.NotEquals ||
        node.operator.type === SegmentOperatorType.NotExists
      ) {
        const varName = qb.getVariableName();
        return [
          {
            condition: `event_type == 'identify'`,
            type: "segment",
            uniqValue: "''",
            // using stateId as placeholder string to allow NotEquals and NotExists
            // to select empty values. no real danger of collissions given that
            // stateId is a uuid
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
      if (!stateId) {
        return [];
      }
      const propertyConditions = node.properties?.flatMap((property) => {
        const { operator } = property;
        const path = toJsonPathParamCh({
          path: property.path,
          qb,
        });

        if (!path) {
          return [];
        }
        switch (operator.type) {
          case SegmentOperatorType.Equals: {
            return `toString(JSON_VALUE(properties, ${path})) == ${qb.addQueryValue(
              operator.value,
              "String",
            )}`;
          }
          case SegmentOperatorType.Exists: {
            return `JSON_VALUE(properties, ${path}) != ''`;
          }
          case SegmentOperatorType.NotExists: {
            return `JSON_VALUE(properties, ${path}) == ''`;
          }
          case SegmentOperatorType.GreaterThanOrEqual: {
            const varName = qb.getVariableName();
            return `(toFloat64OrNull(JSON_VALUE(properties, ${path})) as ${varName}) is not Null and assumeNotNull(${varName}) >= ${qb.addQueryValue(
              operator.value,
              "Float64",
            )}`;
          }
          case SegmentOperatorType.LessThan: {
            const varName = qb.getVariableName();
            return `(toFloat64OrNull(JSON_VALUE(properties, ${path})) as ${varName}) is not Null and assumeNotNull(${varName}) < ${qb.addQueryValue(
              operator.value,
              "Float64",
            )}`;
          }
          case SegmentOperatorType.NotEquals: {
            return `toString(JSON_VALUE(properties, ${path})) != ${qb.addQueryValue(
              operator.value,
              "String",
            )}`;
          }
          case SegmentOperatorType.HasBeen: {
            throw new Error(
              `Unimplemented segment operator for performed node ${operator.type} for segment: ${segment.id} and node: ${node.id}`,
            );
          }
          case SegmentOperatorType.Within: {
            throw new Error(
              `Unimplemented segment operator for performed node ${operator.type} for segment: ${segment.id} and node: ${node.id}`,
            );
          }
          default:
            assertUnreachable(operator);
            return [];
        }
      });
      const eventTimeExpression: string | undefined = node.withinSeconds
        ? truncateEventTimeExpression(node.withinSeconds)
        : undefined;

      const prefixCondition = getPrefixCondition({
        column: "event",
        value: node.event,
        qb,
      });
      const conditions: string[] = ["event_type == 'track'"];
      if (prefixCondition) {
        conditions.push(prefixCondition);
      }
      if (propertyConditions?.length) {
        conditions.push(`(${propertyConditions.join(" and ")})`);
      }

      return [
        {
          condition: conditions.join(" and "),
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
      if (!stateId) {
        return [];
      }
      const whereConditions = node.whereProperties?.flatMap((property) => {
        const operatorType = property.operator.type;
        const path = toJsonPathParamCh({
          path: property.path,
          qb,
        });
        if (!path) {
          return [];
        }
        const propertyValue = `JSON_VALUE(properties, ${path})`;
        switch (operatorType) {
          case SegmentOperatorType.Equals: {
            return `toString(${propertyValue}) == ${qb.addQueryValue(
              property.operator.value,
              "String",
            )}`;
          }
          case SegmentOperatorType.NotEquals: {
            return `toString(${propertyValue}) != ${qb.addQueryValue(
              property.operator.value,
              "String",
            )}`;
          }
          case SegmentOperatorType.Exists: {
            return `${propertyValue} != ''`;
          }
          case SegmentOperatorType.NotExists: {
            return `${propertyValue} == ''`;
          }
          default:
            throw new Error(
              `Unimplemented segment operator for performed node ${operatorType} for segment: ${segment.id} and node: ${node.id}`,
            );
        }
      });
      const propertyValues =
        node.hasProperties?.flatMap((property) => {
          const path = toJsonPathParamCh({
            path: property.path,
            qb,
          });
          if (!path) {
            return [];
          }
          return `JSON_VALUE(properties, ${path})`;
        }) ?? [];
      if (propertyValues.length === 0) {
        return [];
      }

      const prefixCondition = getPrefixCondition({
        column: "event",
        value: node.event,
        qb,
      });
      const conditions: string[] = ["event_type == 'track'"];
      if (prefixCondition) {
        conditions.push(prefixCondition);
      }
      if (whereConditions?.length) {
        conditions.push(`(${whereConditions.join(" and ")})`);
      }
      const condition = conditions.join(" and ");
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
    case SegmentNodeType.RandomBucket: {
      return [];
    }
    case SegmentNodeType.KeyedPerformed: {
      return [];
    }
    case SegmentNodeType.Everyone: {
      const stateId = segmentNodeStateId(segment, node.id);
      if (!stateId) {
        return [];
      }
      return [
        {
          condition: "True",
          type: "segment",
          uniqValue: "'0'",
          computedPropertyId: segment.id,
          stateId,
        },
      ];
    }
    default:
      assertUnreachable(node);
  }
}

function leafUserPropertyToSubQuery({
  userProperty,
  child,
  qb,
  excludeNulls = false,
}: {
  userProperty: SavedUserPropertyResource;
  child: LeafUserPropertyDefinition;
  excludeNulls?: boolean;
  qb: ClickHouseQueryBuilder;
}): SubQueryData | null {
  switch (child.type) {
    case UserPropertyDefinitionType.Trait: {
      const stateId = userPropertyStateId(userProperty, child.id);
      if (child.path.length === 0 || !stateId) {
        return null;
      }
      const path = toJsonPathParamCh({
        path: child.path,
        qb,
      });
      if (!path) {
        return null;
      }
      const conditions = ["event_type == 'identify'"];
      if (excludeNulls) {
        conditions.push(`JSON_VALUE(properties, ${path}) != 'null'`);
      }
      return {
        condition: conditions.join(" and "),
        type: "user_property",
        uniqValue: "''",
        argMaxValue: `JSON_VALUE(properties, ${path})`,
        computedPropertyId: userProperty.id,
        stateId,
      };
    }
    case UserPropertyDefinitionType.Performed: {
      if (child.skipReCompute) {
        return null;
      }
      const stateId = userPropertyStateId(userProperty, child.id);
      if (child.path.length === 0 || !stateId) {
        return null;
      }
      const path = toJsonPathParamCh({
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
                const propertyPath = toJsonPathParamCh({
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
      const prefixCondition = getPrefixCondition({
        column: "event",
        value: child.event,
        qb,
      });
      const conditions: string[] = ["event_type == 'track'"];
      if (prefixCondition) {
        conditions.push(prefixCondition);
      }
      if (excludeNulls) {
        conditions.push(`JSON_VALUE(properties, ${path}) != 'null'`);
      }
      if (propertiesCondition) {
        conditions.push(`(${propertiesCondition})`);
      }
      return {
        condition: conditions.join(" and "),
        type: "user_property",
        uniqValue: "''",
        argMaxValue: `JSON_VALUE(properties, ${path})`,
        computedPropertyId: userProperty.id,
        stateId,
      };
    }
    case UserPropertyDefinitionType.File: {
      const performedDefinition = fileUserPropertyToPerformed({
        userProperty: child,
      });
      const fileUserProperty: SavedUserPropertyResource = {
        ...userProperty,
        definition: performedDefinition,
      };
      return leafUserPropertyToSubQuery({
        userProperty: fileUserProperty,
        child: performedDefinition,
        qb,
      });
    }
    case UserPropertyDefinitionType.KeyedPerformed: {
      return null;
    }
    default:
      assertUnreachable(child);
  }
}

function groupedUserPropertyToSubQuery({
  userProperty,
  group,
  node,
  qb,
  excludeNulls = false,
}: {
  userProperty: SavedUserPropertyResource;
  node: GroupChildrenUserPropertyDefinitions;
  group: GroupUserPropertyDefinition;
  qb: ClickHouseQueryBuilder;
  excludeNulls?: boolean;
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
          excludeNulls: true,
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
        excludeNulls,
      });

      if (!subQuery) {
        return [];
      }
      return [subQuery];
    }
    case UserPropertyDefinitionType.Performed: {
      if (node.skipReCompute) {
        return [];
      }
      const subQuery = leafUserPropertyToSubQuery({
        userProperty,
        child: node,
        qb,
        excludeNulls,
      });

      if (!subQuery) {
        return [];
      }
      return [subQuery];
    }
    case UserPropertyDefinitionType.File: {
      const subQuery = leafUserPropertyToSubQuery({
        userProperty,
        child: node,
        qb,
        excludeNulls,
      });
      if (!subQuery) {
        return [];
      }
      return [subQuery];
    }
    case UserPropertyDefinitionType.KeyedPerformed: {
      return [];
    }
    default:
      assertUnreachable(node);
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
  if (!stateId) {
    return [];
  }
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
      if (userProperty.definition.skipReCompute) {
        return [];
      }
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
    case UserPropertyDefinitionType.File: {
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
    case UserPropertyDefinitionType.KeyedPerformed: {
      return [];
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
      'user_property',
      computed_property_id,
      user_id,
      False as segment_value,
      ${ac.query} as user_property_value,
      arrayReduce('max', mapValues(max_event_time)),
      toDateTime64(${nowSeconds}, 3) as assigned_at
    from (
      select
        workspace_id,
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
}): StandardUserPropertyAssignmentConfig | null {
  switch (child.type) {
    case UserPropertyDefinitionType.Trait: {
      const stateId = userPropertyStateId(userProperty, child.id);
      if (!stateId) {
        return null;
      }
      return {
        query: `last_value[${qb.addQueryValue(stateId, "String")}]`,
        type: UserPropertyAssignmentType.Standard,
        stateIds: [stateId],
      };
    }
    case UserPropertyDefinitionType.Performed: {
      if (child.skipReCompute) {
        return null;
      }
      const stateId = userPropertyStateId(userProperty, child.id);
      if (!stateId) {
        return null;
      }
      return {
        query: `last_value[${qb.addQueryValue(stateId, "String")}]`,
        type: UserPropertyAssignmentType.Standard,
        stateIds: [stateId],
      };
    }
    case UserPropertyDefinitionType.File: {
      const performedDefinition = fileUserPropertyToPerformed({
        userProperty: child,
      });
      const fileUserProperty: SavedUserPropertyResource = {
        ...userProperty,
        definition: performedDefinition,
      };
      return leafUserPropertyToAssignment({
        userProperty: fileUserProperty,
        child: performedDefinition,
        qb,
      });
    }
    case UserPropertyDefinitionType.KeyedPerformed: {
      return null;
    }
    default:
      assertUnreachable(child);
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
      if (node.skipReCompute) {
        return null;
      }
      return leafUserPropertyToAssignment({
        userProperty,
        child: node,
        qb,
      });
    }
    case UserPropertyDefinitionType.File: {
      return leafUserPropertyToAssignment({
        userProperty,
        child: node,
        qb,
      });
    }
    case UserPropertyDefinitionType.KeyedPerformed: {
      return null;
    }
    default:
      assertUnreachable(node);
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
      if (!stateId) {
        return null;
      }
      return {
        type: UserPropertyAssignmentType.PerformedMany,
        stateId,
      };
    }
    case UserPropertyDefinitionType.AnonymousId: {
      const stateId = userPropertyStateId(userProperty);
      if (!stateId) {
        return null;
      }
      return {
        type: UserPropertyAssignmentType.Standard,
        query: `last_value[${qb.addQueryValue(stateId, "String")}]`,
        stateIds: [stateId],
      };
    }
    case UserPropertyDefinitionType.Id: {
      const stateId = userPropertyStateId(userProperty);
      if (!stateId) {
        return null;
      }
      return {
        type: UserPropertyAssignmentType.Standard,
        query: `last_value[${qb.addQueryValue(stateId, "String")}]`,
        stateIds: [stateId],
      };
    }
    case UserPropertyDefinitionType.Performed: {
      if (userProperty.definition.skipReCompute) {
        return null;
      }
      return leafUserPropertyToAssignment({
        userProperty,
        child: userProperty.definition,
        qb,
      });
    }
    case UserPropertyDefinitionType.File: {
      return leafUserPropertyToAssignment({
        userProperty,
        child: userProperty.definition,
        qb,
      });
    }
    case UserPropertyDefinitionType.KeyedPerformed: {
      return null;
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

    const qb = new ClickHouseQueryBuilder();
    let subQueryData: FullSubQueryData[] = [];

    for (const segment of segments) {
      const newSubQueryData = withSpanSync(
        { name: "compute-segment-state" },
        (spanSegment) => {
          spanSegment.setAttribute("workspaceId", workspaceId);
          spanSegment.setAttribute("segmentId", segment.id);

          return segmentNodeToStateSubQuery({
            segment,
            node: segment.definition.entryNode,
            qb,
          }).map((subQuery) => ({
            ...subQuery,
            version: segment.definitionUpdatedAt.toString(),
          }));
        },
      );
      subQueryData = subQueryData.concat(newSubQueryData);
    }

    for (const userProperty of userProperties) {
      const newSubQueryData = withSpanSync(
        { name: "compute-user-property-state" },
        (spanUserProperty) => {
          spanUserProperty.setAttribute("workspaceId", workspaceId);
          spanUserProperty.setAttribute("userPropertyId", userProperty.id);

          return userPropertyToSubQuery({
            userProperty,
            qb,
          }).map((subQuery) => ({
            ...subQuery,
            version: userProperty.definitionUpdatedAt.toString(),
          }));
        },
      );
      subQueryData = subQueryData.concat(newSubQueryData);
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

    const queries = Array.from(subQueriesWithPeriods.entries()).flatMap(
      ([period, periodSubQueries]) => {
        const lowerBoundClause =
          period > 0
            ? `and processing_time >= toDateTime64(${period / 1000}, 3)`
            : ``;

        return periodSubQueries.map(async (subQuery) => {
          const joinedPrior = !subQuery.joinPriorStateValue
            ? ""
            : `
            AND (
              user_id,
              last_value
            ) NOT IN (
              SELECT
                user_id,
                argMaxMerge(last_value) as last_value
              FROM computed_property_state_v2
              WHERE
                workspace_id = ${workspaceIdClause}
                AND type = '${subQuery.type}'
                AND computed_property_id = '${subQuery.computedPropertyId}'
                AND state_id = '${subQuery.stateId}'
              GROUP BY
                user_id
            )
          `;

          const query = `
            insert into computed_property_state_v2
            select
              ue.workspace_id,
              '${subQuery.type}' as type,
              '${subQuery.computedPropertyId}' as computed_property_id,
              '${subQuery.stateId}' as state_id,
              ue.user_id,
              argMaxState(${subQuery.argMaxValue ?? "''"} as last_value, ue.event_time),
              uniqState(${subQuery.uniqValue ?? "''"} as unique_value),
              ${subQuery.eventTimeExpression ?? "toDateTime64('0000-00-00 00:00:00', 3)"} as truncated_event_time,
              groupArrayState(${subQuery.recordMessageId ? "message_id" : "''"}  as grouped_message_id),
              toDateTime64(${nowSeconds}, 3) as computed_at
            from user_events_v2 ue
            where
              workspace_id = ${workspaceIdClause}
              and processing_time <= toDateTime64(${nowSeconds}, 3)
              and (${subQuery.condition})
              and (
                unique_value != ''
                or grouped_message_id != ''
                or (last_value != '' ${joinedPrior})
              )
              ${lowerBoundClause}
            group by
              ue.workspace_id,
              ue.user_id,
              ue.event_time
          `;

          await command({
            query,
            query_params: qb.getQueries(),
            clickhouse_settings: {
              wait_end_of_query: 1,
              function_json_value_return_type_allow_complex: 1,
              max_execution_time: 15000,
            },
          });
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

interface AssignmentQueryGroup {
  queries: (string | string[])[];
  qb: ClickHouseQueryBuilder;
}

async function execAssignmentQueryGroup({ queries, qb }: AssignmentQueryGroup) {
  for (const query of queries) {
    if (Array.isArray(query)) {
      await Promise.all(
        query.map((q) =>
          command({
            query: q,
            query_params: qb.getQueries(),
            clickhouse_settings: {
              wait_end_of_query: 1,
              max_execution_time: 15000,
            },
          }),
        ),
      );
    } else {
      await command({
        query,
        query_params: qb.getQueries(),
        clickhouse_settings: {
          wait_end_of_query: 1,
          max_execution_time: 15000,
        },
      });
    }
  }
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
    const segmentQueries: AssignmentQueryGroup[] = [];
    const userPropertyQueries: AssignmentQueryGroup[] = [];

    const idUserProperty = userProperties.find(
      (up) => up.definition.type === UserPropertyDefinitionType.Id,
    );

    for (const segment of segments) {
      withSpanSync({ name: "compute-segment-assignments" }, (spanS) => {
        spanS.setAttribute("workspaceId", workspaceId);
        spanS.setAttribute("segmentId", segment.id);

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
          idUserProperty,
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
              workspace_id = ${workspaceIdParam}
              and segment_id = ${segmentIdParam}
              and computed_at <= toDateTime64(${nowSeconds}, 3)
              and state_id in ${qb.addQueryValue(
                assignmentConfig.stateIds,
                "Array(String)",
              )}
              ${lowerBoundClause}
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
          // FIXME use delete operation based on assigned at
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

        const queries: (string | string[])[] = [
          resolvedQueries,
          assignmentQueries,
        ];

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

        segmentQueries.push({
          queries,
          qb,
        });
      });
    }

    for (const userProperty of userProperties) {
      withSpanSync({ name: "compute-user-property-assignments" }, (spanUp) => {
        spanUp.setAttribute("workspaceId", workspaceId);
        spanUp.setAttribute("userPropertyId", userProperty.id);

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
          logger().debug(
            {
              userProperty,
            },
            "skipping write assignment for user property. failed to generate config",
          );
          return;
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
          logger().debug(
            {
              userProperty,
            },
            "skipping write assignment for user property. failed to build query",
          );
          return;
        }
        userPropertyQueries.push({
          queries: [stateQuery],
          qb,
        });
      });
    }

    await Promise.all(
      [...segmentQueries, ...userPropertyQueries].map(execAssignmentQueryGroup),
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

let PROCESS_COUNTER: Counter | null = null;

function processCounter() {
  if (PROCESS_COUNTER !== null) {
    return PROCESS_COUNTER;
  }
  const meter = getMeter();
  const counter = meter.createCounter("process_assignments_counter", {
    description: "Counter for the number of assignments processed",
    unit: "1",
  });
  PROCESS_COUNTER = counter;
  return counter;
}

async function processRowsInner({
  rows,
  workspaceId,
  subscribedJourneys,
}: {
  rows: unknown[];
  workspaceId: string;
  subscribedJourneys: HasStartedJourneyResource[];
}): Promise<string | null> {
  logger().trace(
    {
      rows,
    },
    "processRows",
  );
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
  const cursor = assignments[assignments.length - 1]?.user_id ?? null;
  const pgUserPropertyAssignments: ComputedAssignment[] = [];
  const pgSegmentAssignments: ComputedAssignment[] = [];
  const journeySegmentAssignments: ComputedAssignment[] = [];
  const integrationAssignments: ComputedAssignment[] = [];

  for (const assignment of assignments) {
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

  const counter = processCounter();
  if (pgUserPropertyAssignments.length > 0) {
    counter.add(pgUserPropertyAssignments.length, {
      workspace_id: workspaceId,
      type: "pg_user_property",
    });
  }
  if (pgSegmentAssignments.length > 0) {
    counter.add(pgSegmentAssignments.length, {
      workspace_id: workspaceId,
      type: "pg_segment",
    });
  }

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

  if (journeySegmentAssignments.length > 0) {
    counter.add(journeySegmentAssignments.length, {
      workspace_id: workspaceId,
      type: "journey",
    });
  }
  if (integrationAssignments.length > 0) {
    counter.add(integrationAssignments.length, {
      workspace_id: workspaceId,
      type: "integration",
    });
  }

  const processedAssignments: ComputedPropertyAssignment[] =
    assignments.flatMap((assignment) => ({
      user_property_value: assignment.latest_user_property_value,
      segment_value: assignment.latest_segment_value,
      ...assignment,
    }));

  await insertProcessedComputedProperties({
    assignments: processedAssignments,
  });
  return cursor;
}

const processRows: typeof processRowsInner = function processRows(args) {
  return withSpan({ name: "process-rows" }, async (span) => {
    span.setAttribute("workspaceId", args.workspaceId);
    return processRowsInner(args);
  });
};

interface BaseProcessAssignmentsQueryArgs {
  workspaceId: string;
  computedPropertyId: string;
  qb: ClickHouseQueryBuilder;
  computedPropertyVersion: string;
  now: number;
  periodByComputedPropertyId: PeriodByComputedPropertyId;
}

type SegmentProcessAssignmentsQueryArgs = BaseProcessAssignmentsQueryArgs & {
  type: "segment";
  processedForType: "journey" | "integration";
  processedFor: string;
};

type UserPropertyProcessAssignmentsQueryArgs =
  BaseProcessAssignmentsQueryArgs & {
    type: "user_property";
    processedForType: "integration";
    processedFor: string;
  };

type PgProcessAssignmentsQueryArgs = BaseProcessAssignmentsQueryArgs & {
  type: "segment" | "user_property";
  processedForType: "pg";
};

type ProcessAssignmentsQueryArgs =
  | SegmentProcessAssignmentsQueryArgs
  | UserPropertyProcessAssignmentsQueryArgs
  | PgProcessAssignmentsQueryArgs;

function buildProcessAssignmentsQuery({
  workspaceId,
  type,
  computedPropertyId,
  qb,
  periodByComputedPropertyId,
  computedPropertyVersion,
  limit,
  cursor,
  ...rest
}: ProcessAssignmentsQueryArgs & {
  limit: number;
  cursor: string | null;
}): string {
  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");
  const computedPropertyIdParam = qb.addQueryValue(
    computedPropertyId,
    "String",
  );
  const processedFor =
    rest.processedForType === "pg" ? "pg" : rest.processedFor;
  const processedForParam = qb.addQueryValue(processedFor, "String");
  const processedForTypeParam = qb.addQueryValue(
    rest.processedForType,
    "String",
  );
  const typeParam = qb.addQueryValue(type, "String");
  let typeCondition: string;
  switch (type) {
    case "segment":
      typeCondition = "cpa.latest_segment_value = true";
      break;
    case "user_property":
      typeCondition = `cpa.latest_user_property_value != '""' AND cpa.latest_user_property_value != ''`;
      break;
  }

  const period = periodByComputedPropertyId.get({
    computedPropertyId,
    version: computedPropertyVersion,
  });
  const periodBound = period?.maxTo.getTime();
  const lowerBoundClause =
    periodBound && periodBound > 0
      ? `and assigned_at >= toDateTime64(${periodBound / 1000}, 3)`
      : "";
  const innerCursorClause = cursor
    ? `and user_id > ${qb.addQueryValue(cursor, "String")}`
    : "";

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
  // TODO remove left join
  const query = `
   SELECT
      ${workspaceIdParam} as workspace_id,
      ${typeParam} as type,
      ${computedPropertyIdParam} as computed_property_id,
      cpa.user_id,
      cpa.latest_segment_value,
      cpa.latest_user_property_value,
      cpa.max_assigned_at,
      ${processedForParam} as processed_for,
      ${processedForTypeParam} as processed_for_type
    FROM (
      SELECT
        user_id,
        max(assigned_at) max_assigned_at,
        argMax(segment_value, assigned_at) latest_segment_value,
        argMax(user_property_value, assigned_at) latest_user_property_value
      FROM computed_property_assignments_v2
      WHERE
        workspace_id = ${workspaceIdParam}
        AND type = ${typeParam}
        AND computed_property_id = ${computedPropertyIdParam}
        ${innerCursorClause}
        ${lowerBoundClause}
      GROUP BY
        user_id
      ORDER BY user_id ASC
    ) cpa
    LEFT ANY JOIN (
      SELECT
        user_id,
        argMax(segment_value, processed_at) segment_value,
        argMax(user_property_value, processed_at) user_property_value
      FROM processed_computed_properties_v2
      WHERE
        workspace_id = ${workspaceIdParam}
        AND type = ${typeParam}
        AND computed_property_id = ${computedPropertyIdParam}
        AND processed_for_type = ${processedForTypeParam}
        AND processed_for = ${processedForParam}
        ${innerCursorClause}
      GROUP BY
        user_id
      ORDER BY user_id ASC
    ) pcp
    ON cpa.user_id = pcp.user_id
    WHERE
      (
        cpa.latest_user_property_value != pcp.user_property_value
        OR cpa.latest_segment_value != pcp.segment_value
      )
      AND (
          (${typeCondition})
          OR (
              pcp.user_id != ''
          )
      )
    ORDER BY cpa.user_id ASC
    LIMIT ${limit}
  `;
  return query;
}

type WithoutProcessorParams<T> = Omit<T, "qb" | "limit" | "cursor">;

type AssignmentProcessorParams = (
  | WithoutProcessorParams<SegmentProcessAssignmentsQueryArgs>
  | WithoutProcessorParams<UserPropertyProcessAssignmentsQueryArgs>
  | WithoutProcessorParams<PgProcessAssignmentsQueryArgs>
) & {
  journeys: HasStartedJourneyResource[];
};

/**
 * AssignmentProcessor is responsible for paginating through assignments to
 * process, while applying a concurrency limit.
 */
class AssignmentProcessor {
  private pageSize;

  private page = 0;

  private params: AssignmentProcessorParams;

  constructor(params: AssignmentProcessorParams) {
    this.params = params;
    this.pageSize = config().readQueryPageSize;
  }

  async process() {
    return withSpan({ name: "process-assignments-query" }, async (span) => {
      span.setAttribute("workspaceId", this.params.workspaceId);
      span.setAttribute("computedPropertyId", this.params.computedPropertyId);
      span.setAttribute("type", this.params.type);
      span.setAttribute("processedForType", this.params.processedForType);
      span.setAttribute(
        "computedPropertyVersion",
        this.params.computedPropertyVersion,
      );
      const queryIds: string[] = [];
      let cursor: string | null = null;
      let retrieved = this.pageSize;
      while (retrieved >= this.pageSize) {
        const qb = new ClickHouseQueryBuilder();
        const currentCursor = cursor;
        const results = await withSpan(
          { name: "process-assignments-query-page" },
          async (pageSpan) => {
            const { journeys, ...processAssignmentsParams } = this.params;
            const pageQueryId = getChCompatibleUuid();
            queryIds.push(pageQueryId);

            pageSpan.setAttribute("workspaceId", this.params.workspaceId);
            pageSpan.setAttribute(
              "computedPropertyId",
              this.params.computedPropertyId,
            );
            pageSpan.setAttribute("type", this.params.type);
            pageSpan.setAttribute(
              "processedForType",
              this.params.processedForType,
            );
            pageSpan.setAttribute("page", this.page);
            pageSpan.setAttribute("pageSize", this.pageSize);
            pageSpan.setAttribute("queryId", pageQueryId);
            pageSpan.setAttribute(
              "computedPropertyVersion",
              this.params.computedPropertyVersion,
            );

            return readLimit()(async () => {
              const query = buildProcessAssignmentsQuery({
                ...processAssignmentsParams,
                limit: this.pageSize,
                cursor: currentCursor,
                qb,
              });

              const resultSet = await chQuery({
                query,
                query_id: pageQueryId,
                query_params: qb.getQueries(),
                format: "JSONEachRow",
                clickhouse_settings: {
                  wait_end_of_query: 1,
                  max_execution_time: 15000,
                  join_algorithm: "grace_hash",
                },
              });
              const resultRows = await resultSet.json();
              const nextCursor = await processRows({
                rows: resultRows,
                workspaceId: this.params.workspaceId,
                subscribedJourneys: journeys,
              });

              const pageRetrieved = resultRows.length;
              pageSpan.setAttribute("retrieved", pageRetrieved);
              return { retrieved: pageRetrieved, cursor: nextCursor };
            });
          },
        );
        cursor = results.cursor;
        retrieved = results.retrieved;

        logger().info(
          {
            retrieved,
            page: this.page,
            pageSize: this.pageSize,
            workspaceId: this.params.workspaceId,
            computedPropertyId: this.params.computedPropertyId,
            type: this.params.type,
            processedForType: this.params.processedForType,
          },
          "retrieved assignments",
        );
        this.page += 1;
      }

      span.setAttribute("processedPages", this.page);
      span.setAttribute("queryIds", queryIds);
    });
  }
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
    const segmentById = segments.reduce<Map<string, SavedSegmentResource>>(
      (memo, s) => {
        memo.set(s.id, s);
        return memo;
      },
      new Map(),
    );
    const userPropertyById = userProperties.reduce<
      Map<string, SavedUserPropertyResource>
    >((memo, up) => {
      memo.set(up.id, up);
      return memo;
    }, new Map());

    // segment id -> journey id
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

    // user property id -> integration name
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

    // segment id -> integration name
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

    const periodByComputedPropertyId = await getPeriodsByComputedPropertyId({
      workspaceId,
      step: ComputedPropertyStep.ProcessAssignments,
    });

    const assignmentProcessors: AssignmentProcessor[] = [];

    for (const userProperty of userProperties) {
      const processor = new AssignmentProcessor({
        workspaceId,
        type: "user_property",
        processedForType: "pg",
        computedPropertyId: userProperty.id,
        periodByComputedPropertyId,
        computedPropertyVersion: userProperty.definitionUpdatedAt.toString(),
        now,
        journeys,
      });
      assignmentProcessors.push(processor);
    }

    for (const segment of segments) {
      const processor = new AssignmentProcessor({
        workspaceId,
        type: "segment",
        processedForType: "pg",
        computedPropertyId: segment.id,
        periodByComputedPropertyId,
        computedPropertyVersion: segment.definitionUpdatedAt.toString(),
        now,
        journeys,
      });
      assignmentProcessors.push(processor);
    }

    for (const [segmentId, journeySet] of Array.from(subscribedJourneyMap)) {
      const segment = segmentById.get(segmentId);
      if (!segment) {
        continue;
      }
      for (const journeyId of Array.from(journeySet)) {
        const processor = new AssignmentProcessor({
          workspaceId,
          type: "segment",
          processedForType: "journey",
          computedPropertyId: segmentId,
          processedFor: journeyId,
          periodByComputedPropertyId,
          computedPropertyVersion: segment.definitionUpdatedAt.toString(),
          now,
          journeys,
        });
        assignmentProcessors.push(processor);
      }
    }

    for (const [segmentId, integrationSet] of Array.from(
      subscribedIntegrationSegmentMap,
    )) {
      const segment = segmentById.get(segmentId);
      if (!segment) {
        continue;
      }
      for (const integrationName of Array.from(integrationSet)) {
        const processor = new AssignmentProcessor({
          workspaceId,
          type: "segment",
          processedForType: "integration",
          computedPropertyId: segmentId,
          processedFor: integrationName,
          periodByComputedPropertyId,
          computedPropertyVersion: segment.definitionUpdatedAt.toString(),
          now,
          journeys,
        });
        assignmentProcessors.push(processor);
      }
    }

    for (const [userPropertyId, integrationSet] of Array.from(
      subscribedIntegrationUserPropertyMap,
    )) {
      const userProperty = userPropertyById.get(userPropertyId);
      if (!userProperty) {
        continue;
      }
      for (const integrationName of Array.from(integrationSet)) {
        const processor = new AssignmentProcessor({
          workspaceId,
          type: "user_property",
          processedForType: "integration",
          computedPropertyId: userPropertyId,
          processedFor: integrationName,
          periodByComputedPropertyId,
          computedPropertyVersion: userProperty.definitionUpdatedAt.toString(),
          now,
          journeys,
        });
        assignmentProcessors.push(processor);
      }
    }

    await Promise.all(
      assignmentProcessors.map((processor) => processor.process()),
    );

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
