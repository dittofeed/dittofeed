/* eslint-disable no-await-in-loop */
import { Prisma } from "@prisma/client";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import pLimit from "p-limit";
import { mapValues } from "remeda";
import { v4 as uuidv4, v5 as uuidv5 } from "uuid";

import {
  clickhouseClient,
  ClickHouseQueryBuilder,
  createClickhouseClient,
  getChCompatibleUuid,
  streamClickhouseQuery,
} from "../clickhouse";
import config from "../config";
import { HUBSPOT_INTEGRATION } from "../constants";
import { startHubspotUserIntegrationWorkflow } from "../integrations/hubspot/signalUtils";
import { getSubscribedSegments } from "../journeys";
import {
  segmentUpdateSignal,
  userJourneyWorkflow,
} from "../journeys/userWorkflow";
import logger from "../logger";
import prisma from "../prisma";
import { upsertBulkSegmentAssignments } from "../segments";
import { getContext } from "../temporal/activity";
import {
  ComputedAssignment,
  ComputedPropertyAssignment,
  ComputedPropertyPeriod,
  ComputedPropertyUpdate,
  JourneyResource,
  SavedIntegrationResource,
  SavedSegmentResource,
  SavedUserPropertyResource,
  SegmentNode,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentUpdate,
  UserPropertyDefinitionType,
} from "../types";
import { insertProcessedComputedProperties } from "../userEvents/clickhouse";
import { upsertBulkUserPropertyAssignments } from "../userProperties";

async function signalJourney({
  segmentId,
  workspaceId,
  segmentAssignment,
  journey,
}: {
  segmentId: string;
  workspaceId: string;
  segmentAssignment: ComputedAssignment;
  journey: JourneyResource;
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
  const workflowId = `user-journey-${journey.id}-${segmentAssignment.user_id}`;

  const userId = segmentAssignment.user_id;
  await workflowClient.signalWithStart<
    typeof userJourneyWorkflow,
    [SegmentUpdate]
  >(userJourneyWorkflow, {
    taskQueue: "default",
    workflowId,
    args: [
      {
        journeyId: journey.id,
        definition: journey.definition,
        workspaceId,
        userId,
      },
    ],
    signal: segmentUpdateSignal,
    signalArgs: [segmentUpdate],
  });
}

// TODO pull out into separate files
export async function createTables() {
  const queries: string[] = [
    `
      CREATE TABLE IF NOT EXISTS user_events_v2 (
        event_type Enum(
          'identify' = 1,
          'track' = 2,
          'page' = 3,
          'screen' = 4,
          'group' = 5,
          'alias' = 6
        ) DEFAULT JSONExtract(
          message_raw,
          'type',
          'Enum(\\'identify\\' = 1, \\'track\\' = 2, \\'page\\' = 3, \\'screen\\' = 4, \\'group\\' = 5, \\'alias\\' = 6)'
        ),
        event String DEFAULT JSONExtract(
          message_raw,
          'event',
          'String'
        ),
        event_time DateTime64 DEFAULT assumeNotNull(
          parseDateTime64BestEffortOrNull(
            JSONExtractString(message_raw, 'timestamp'),
            3
          )
        ),
        message_id String,
        user_id String DEFAULT JSONExtract(
          message_raw,
          'userId',
          'String'
        ),
        anonymous_id String DEFAULT JSONExtract(
          message_raw,
          'anonymousId',
          'String'
        ),
        user_or_anonymous_id String DEFAULT assumeNotNull(
          coalesce(
            JSONExtract(message_raw, 'userId', 'Nullable(String)'),
            JSONExtract(message_raw, 'anonymousId', 'Nullable(String)')
          )
        ),
        properties String DEFAULT assumeNotNull(
          coalesce(
            JSONExtract(message_raw, 'traits', 'Nullable(String)'),
            JSONExtract(message_raw, 'properties', 'Nullable(String)')
          )
        ),
        processing_time DateTime64(3) DEFAULT now64(3),
        message_raw String,
        workspace_id String
      )
      ENGINE = MergeTree()
      ORDER BY (
        workspace_id,
        processing_time,
        user_or_anonymous_id,
        event_time,
        message_id
    );
    `,
    `
      CREATE TABLE IF NOT EXISTS computed_property_state (
        workspace_id LowCardinality(String),
        type Enum('user_property' = 1, 'segment' = 2),
        computed_property_id LowCardinality(String),
        state_id LowCardinality(String),
        user_id String,
        last_value AggregateFunction(argMax, String, DateTime64(3)),
        unique_count AggregateFunction(uniq, String),
        max_event_time AggregateFunction(max, DateTime64(3)),
        computed_at DateTime64(3)
      )
      ENGINE = AggregatingMergeTree()
      ORDER BY (
        workspace_id,
        type,
        computed_property_id,
        state_id,
        user_id
      );
    `,
    `
      CREATE TABLE IF NOT EXISTS computed_property_assignments_v2 (
        workspace_id LowCardinality(String),
        type Enum('user_property' = 1, 'segment' = 2),
        computed_property_id LowCardinality(String),
        user_id String,
        segment_value Boolean,
        user_property_value String,
        max_event_time DateTime64(3),
        assigned_at DateTime64(3) DEFAULT now64(3),
      )
      ENGINE = ReplacingMergeTree()
      ORDER BY (
        workspace_id,
        type,
        computed_property_id,
        user_id
      );
    `,
    `
      CREATE TABLE IF NOT EXISTS processed_computed_properties_v2 (
        workspace_id LowCardinality(String),
        user_id String,
        type Enum('user_property' = 1, 'segment' = 2),
        computed_property_id LowCardinality(String),
        processed_for LowCardinality(String),
        processed_for_type LowCardinality(String),
        segment_value Boolean,
        user_property_value String,
        max_event_time DateTime64(3),
        processed_at DateTime64(3) DEFAULT now64(3),
      )
      ENGINE = ReplacingMergeTree()
      ORDER BY (
        workspace_id,
        computed_property_id,
        processed_for_type,
        processed_for,
        user_id
      );
    `,
    `
      create table if not exists updated_computed_property_state(
        workspace_id LowCardinality(String),
        type Enum('user_property' = 1, 'segment' = 2),
        computed_property_id LowCardinality(String),
        state_id LowCardinality(String),
        user_id String,
        computed_at DateTime64(3)
      ) Engine=MergeTree
      partition by toYYYYMMDD(computed_at)
      order by computed_at
      TTL toStartOfDay(computed_at) + interval 100 day;
    `,
    `
      create table if not exists updated_property_assignments_v2(
        workspace_id LowCardinality(String),
        type Enum('user_property' = 1, 'segment' = 2),
        computed_property_id LowCardinality(String),
        user_id String,
        assigned_at DateTime64(3)
      ) Engine=MergeTree
      partition by toYYYYMMDD(assigned_at)
      order by assigned_at
      TTL toStartOfDay(assigned_at) + interval 100 day;
    `,
  ];

  await Promise.all(
    queries.map((query) =>
      clickhouseClient().command({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      })
    )
  );
  const mvQueries = [
    `
      create materialized view if not exists updated_property_assignments_v2_mv to updated_property_assignments_v2
      as select
        workspace_id,
        type,
        computed_property_id,
        user_id,
        assigned_at
      from computed_property_assignments_v2
      group by
        workspace_id,
        type,
        computed_property_id,
        user_id,
        assigned_at;
    `,
    `
      create materialized view if not exists updated_computed_property_state_mv to updated_computed_property_state
      as select
        workspace_id,
        type,
        computed_property_id,
        state_id,
        user_id,
        computed_at
      from computed_property_state
      group by
        workspace_id,
        type,
        computed_property_id,
        state_id,
        user_id,
        computed_at;
    `,
  ];

  await Promise.all(
    mvQueries.map((query) =>
      clickhouseClient().command({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      })
    )
  );
}

export enum ComputedPropertyStep {
  ComputeState = "ComputeState",
  ComputeAssignments = "ComputeAssignments",
  ProcessAssignments = "ProcessAssignments",
}

type PeriodByComputedPropertyId = Map<
  string,
  Pick<
    AggregatedComputedPropertyPeriod,
    "maxTo" | "computedPropertyId" | "version"
  >
>;

async function getPeriodsByComputedPropertyId({
  workspaceId,
  step,
}: {
  workspaceId: string;
  step: ComputedPropertyStep;
}): Promise<PeriodByComputedPropertyId> {
  const periodsQuery = Prisma.sql`
    SELECT DISTINCT ON ("workspaceId", "type", "computedPropertyId")
      "type",
      "computedPropertyId",
      "version",
      MAX("to") OVER (PARTITION BY "workspaceId", "type", "computedPropertyId") as "maxTo"
    FROM "ComputedPropertyPeriod"
    WHERE
      "workspaceId" = CAST(${workspaceId} AS UUID)
      AND "step" = ${step}
    ORDER BY "workspaceId", "type", "computedPropertyId", "to" DESC;
  `;
  const periods = await prisma().$queryRaw<AggregatedComputedPropertyPeriod[]>(
    periodsQuery
  );

  const periodByComputedPropertyId = periods.reduce<PeriodByComputedPropertyId>(
    (acc, period) => {
      const { maxTo } = period;
      acc.set(period.computedPropertyId, {
        maxTo,
        computedPropertyId: period.computedPropertyId,
        version: period.version,
      });
      return acc;
    },
    new Map()
  );

  return periodByComputedPropertyId;
}

export async function dropTables() {
  const queries: string[] = [
    `
      DROP TABLE IF EXISTS user_events_v2;
    `,
    `
      DROP TABLE IF EXISTS computed_property_state;
    `,
    `
      DROP TABLE IF EXISTS computed_property_assignments_v2;
    `,
    `
      DROP TABLE IF EXISTS processed_computed_properties_v2;
    `,
    `
      DROP TABLE IF EXISTS updated_computed_property_state;
    `,
    `
      DROP TABLE IF EXISTS updated_computed_property_state_mv;
    `,
    `
      DROP TABLE IF EXISTS updated_property_assignments_v2;
    `,
    `
      DROP TABLE IF EXISTS updated_property_assignments_v2_mv;
    `,
  ];

  await Promise.all(
    queries.map((query) =>
      clickhouseClient().command({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      })
    )
  );
}

async function createPeriods({
  workspaceId,
  userProperties,
  segments,
  now,
  periodByComputedPropertyId,
  step,
}: {
  step: ComputedPropertyStep;
  workspaceId: string;
  userProperties: SavedUserPropertyResource[];
  segments: SavedSegmentResource[];
  periodByComputedPropertyId: PeriodByComputedPropertyId;
  now: number;
}) {
  const newPeriods: Prisma.ComputedPropertyPeriodCreateManyInput[] = [];

  for (const segment of segments) {
    const previousPeriod = periodByComputedPropertyId.get(segment.id);
    newPeriods.push({
      workspaceId,
      step,
      type: "Segment",
      computedPropertyId: segment.id,
      from: previousPeriod ? new Date(previousPeriod.maxTo) : null,
      to: new Date(now),
      version: segment.definitionUpdatedAt.toString(),
    });
  }

  for (const userProperty of userProperties) {
    const previousPeriod = periodByComputedPropertyId.get(userProperty.id);
    newPeriods.push({
      workspaceId,
      step,
      type: "UserProperty",
      computedPropertyId: userProperty.id,
      from: previousPeriod ? new Date(previousPeriod.maxTo) : null,
      to: new Date(now),
      version: userProperty.definitionUpdatedAt.toString(),
    });
  }

  await prisma().computedPropertyPeriod.createMany({
    data: newPeriods,
    skipDuplicates: true,
  });
}

interface SubQueryData {
  condition: string;
  type: "user_property" | "segment";
  computedPropertyId: string;
  stateId: string;
  argMaxValue?: string;
  uniqValue?: string;
  comparisonCondition?: string;
}

type AggregatedComputedPropertyPeriod = Omit<
  ComputedPropertyPeriod,
  "from" | "workspaceId" | "to"
> & {
  maxTo: ComputedPropertyPeriod["to"];
};

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
      // deprecated operator
      // FIXME

      const stateId = segmentNodeStateId(segment, node.id);
      const path = qb.addQueryValue(node.path, "String");
      if (node.operator.type === SegmentOperatorType.HasBeen) {
        // FIXME check that argMax value is not empty
        console.log("loc2 has been");
        // const variableName = getChCompatibleUuid();
        return [
          {
            // condition: `event_type == 'identify' and argMaxMerge(cps.last_value) != (visitParamExtractString(properties, ${path}) as ${variableName})`,
            // condition: `event_type == 'identify' and argMaxMerge(cps.last_value) != visitParamExtractString(properties, ${path})`,
            condition: `event_type == 'identify'`,
            // condition: `1=1`,
            type: "segment",
            uniqValue: "''",
            // argMaxValue: "''",
            // argMaxValue: `${variableName}`,
            // argMaxValue: `visitParamExtractString(properties, ${path}) as ${variableName}`,
            argMaxValue: `visitParamExtractString(properties, ${path})`,
            computedPropertyId: segment.id,
            stateId,
          },
        ];
      }
      return [
        {
          condition: `event_type == 'identify'`,
          type: "segment",
          uniqValue: "''",
          argMaxValue: `visitParamExtractString(properties, ${path})`,
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
            "AND child node not found"
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
    default:
      throw new Error(`Unhandled user property type: ${node.type}`);
  }
}

export function segmentNodeStateId(
  segment: SavedSegmentResource,
  nodeId: string
): string {
  return uuidv5(
    `${segment.definitionUpdatedAt.toString()}:${
      segment.definition.entryNode.id
    }`,
    segment.id
  );
}

export async function computeState({
  workspaceId,
  segments,
  userProperties,
  now,
}: {
  workspaceId: string;
  // timestamp in ms
  now: number;
  segments: SavedSegmentResource[];
  userProperties: SavedUserPropertyResource[];
}) {
  const qb = new ClickHouseQueryBuilder();
  // TODO implement pagination
  let subQueryData: SubQueryData[] = [];

  for (const segment of segments) {
    subQueryData = subQueryData.concat(
      segmentNodeToStateSubQuery({
        segment,
        node: segment.definition.entryNode,
        qb,
      })
    );
  }

  for (const userProperty of userProperties) {
    let subQuery: SubQueryData;
    switch (userProperty.definition.type) {
      case UserPropertyDefinitionType.Trait: {
        const stateId = uuidv5(
          userProperty.definitionUpdatedAt.toString(),
          userProperty.id
        );
        const path = qb.addQueryValue(userProperty.definition.path, "String");
        // FIXME check that value is not empty
        subQuery = {
          condition: `event_type == 'identify'`,
          type: "user_property",
          uniqValue: "''",
          argMaxValue: `visitParamExtractString(properties, ${path})`,
          computedPropertyId: userProperty.id,
          stateId,
        };
        break;
      }
      default:
        throw new Error(
          `Unhandled user property type: ${userProperty.definition.type}`
        );
    }
    subQueryData.push(subQuery);
  }
  if (subQueryData.length === 0) {
    return;
  }

  const periodByComputedPropertyId = await getPeriodsByComputedPropertyId({
    workspaceId,
    step: ComputedPropertyStep.ComputeState,
  });

  const subQueriesWithPeriods = subQueryData.reduce<
    Record<number, SubQueryData[]>
  >((memo, subQuery) => {
    const period =
      periodByComputedPropertyId.get(subQuery.computedPropertyId) ?? null;
    const periodKey = period?.maxTo.getTime() ?? 0;
    const subQueriesForPeriod = memo[periodKey] ?? [];
    memo[periodKey] = [...subQueriesForPeriod, subQuery];
    return memo;
  }, {});

  const nowSeconds = now / 1000;
  const queries = Object.values(
    mapValues(subQueriesWithPeriods, async (periodSubQueries, period) => {
      const lowerBoundClause =
        period !== 0
          ? `and processing_time >= toDateTime64(${period / 1000}, 3)`
          : ``;

      console.log("subqueries loc3", periodSubQueries);

      const subQueries = periodSubQueries
        .map(
          (subQuery) => `
            if(
              ${subQuery.condition},
              (
                '${subQuery.type}',
                '${subQuery.computedPropertyId}',
                '${subQuery.stateId}',
                ${subQuery.argMaxValue},
                ${subQuery.uniqValue}
              ),
              (Null, Null, Null, Null, Null)
            )
          `
        )
        .join(", ");
      const query2 = `
        insert into computed_property_state
        select
          inner2.workspace_id,
          inner2.type,
          inner2.computed_property_id,
          inner2.state_id,
          inner2.user_id,
          inner2.last_value,
          inner2.unique_count,
          inner2.max_event_time,
          toDateTime64(${nowSeconds}, 3) as computed_at
        from (
          select
            inner1.workspace_id as workspace_id,
            inner1.type as type,
            inner1.computed_property_id as computed_property_id,
            inner1.state_id as state_id,
            inner1.user_id as user_id,
            argMaxState(inner1.last_value, inner1.event_time) as last_value,
            uniqState(inner1.unique_count) as unique_count,
            maxState(inner1.event_time) as max_event_time
            -- argMaxMerge(cps.last_value) as existing_last_value,
            -- uniqMerge(cps.unique_count) as existing_unique_count
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
              event_time
            from user_events_v2 ue
            where
              workspace_id = ${qb.addQueryValue(workspaceId, "String")}
              -- and processing_time <= toDateTime64(${nowSeconds}, 3)
              -- ${lowerBoundClause}
          ) as inner1
          -- join computed_property_state cps on
          --   inner1.workspace_id = cps.workspace_id
          --   and inner1.type = cps.type
          --   and inner1.computed_property_id = cps.computed_property_id
          --   and inner1.user_id = cps.user_id
          --   and inner1.state_id = cps.state_id
          group by
            inner1.workspace_id,
            inner1.type,
            inner1.computed_property_id,
            inner1.state_id,
            inner1.user_id,
            inner1.last_value,
            inner1.unique_count,
            inner1.event_time
          -- having
            --existing_last_value != inner1.last_value
        ) inner2
      `;
      const query = `
        insert into computed_property_state
        select
          ue.workspace_id as event_workspace_id,
          (
            arrayJoin(
              arrayFilter(
                v -> not(isNull(v.1)),
                [${subQueries}]
              )
            ) as c
          ).1 as type,
          c.2 as computed_property_id,
          c.3 as state_id,
          user_id,
          argMaxState(ifNull(c.4, ''), event_time) as last_value,
          uniqState(ifNull(c.5, '')) as unique_count,
          maxState(event_time) as max_event_time,
          toDateTime64(${nowSeconds}, 3) as computed_at
        from user_events_v2 ue
        where
          workspace_id = ${qb.addQueryValue(workspaceId, "String")}
          -- and processing_time <= toDateTime64(${nowSeconds}, 3)
          -- ${lowerBoundClause}
        group by
          workspace_id,
          type,
          computed_property_id,
          state_id,
          user_id,
          processing_time;
      `;

      console.log("loc2 query", query);
      await clickhouseClient().command({
        query,
        query_params: qb.getQueries(),
        clickhouse_settings: { wait_end_of_query: 1 },
      });
    })
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
}

function buildComputeAssignmentsSegment({
  node,
  segment,
  qb,
}: {
  node: SegmentNode;
  segment: SavedSegmentResource;
  qb: ClickHouseQueryBuilder;
}): {
  query: string;
} {
  let query: string;
  // for (const segment of segments) {
  //   switch (segment.definition.entryNode.type) {
  //     case SegmentNodeType.Trait: {
  //       break;
  //     }
  //     default:
  //       throw new Error(
  //         `Unhandled user property type: ${segment.definition.entryNode.type}`
  //       );
  //   }
  // }
  return {
    query: "",
  };
}

enum ComputedPropertyType {
  UserProperty = "UserProperty",
  Segment = "Segment",
}

interface SegmentValue {
  type: ComputedPropertyType.Segment;
  segment: SavedSegmentResource;
}

interface UserPropertyValue {
  type: ComputedPropertyType.UserProperty;
  userProperty: SavedUserPropertyResource;
}

type ComputedPropertyValue = SegmentValue | UserPropertyValue;

function buildComputeAssignmentsQuery({
  workspaceId,
  now,
  value,
}: {
  now: number;
  workspaceId: string;
  value: ComputedPropertyValue;
}): {
  query: string;
  queryBuilder: ClickHouseQueryBuilder;
} {
  const nowSeconds = now / 1000;
  const qb = new ClickHouseQueryBuilder();
  let computedPropertyId: string;
  let type: string;
  if (value.type === ComputedPropertyType.Segment) {
    computedPropertyId = value.segment.id;
    type = "segment";
  } else {
    computedPropertyId = value.userProperty.id;
    type = "user_property";
  }
  const query = "";
  // const query = `
  //  insert into computed_property_assignments_v2
  //  select
  //    workspace_id,
  //    type,
  //    computed_property_id,
  //    user_id,
  //    False as segment_value,
  //    toJSONString(argMaxMerge(last_value)) as user_property_value,
  //    maxMerge(max_event_time) as max_event_time,
  //    now64(3) as assigned_at
  //  from computed_property_state
  //  where
  //    (
  //      workspace_id,
  //      type,
  //      computed_property_id,
  //      state_id,
  //      user_id
  //    ) in (
  //      select
  //        workspace_id,
  //        type,
  //        computed_property_id,
  //        state_id,
  //        user_id
  //      from updated_computed_property_state
  //      where
  //        workspace_id = ${qb.addQueryValue(workspaceId, "String")}
  //        and type = ${qb.addQueryValue(type, "String")}
  //        and computed_property_id = ${qb.addQueryValue(
  //          computedPropertyId,
  //          "String"
  //        )}
  //        and state_id = ${qb.addQueryValue(stateId, "String")}
  //        and computed_at <= toDateTime64(${nowSeconds}, 3)
  //        ${lowerBoundClause}
  //    )
  //  group by
  //    workspace_id,
  //    type,
  //    computed_property_id,
  //    user_id;
  //  `;
  return {
    query,
    queryBuilder: qb,
  };
}

export async function computeAssignments({
  workspaceId,
  segments,
  userProperties,
  now,
}: {
  workspaceId: string;
  userProperties: SavedUserPropertyResource[];
  segments: SavedSegmentResource[];
  now: number;
}): Promise<void> {
  const queryies: Promise<unknown>[] = [];

  const periodByComputedPropertyId = await getPeriodsByComputedPropertyId({
    workspaceId,
    step: ComputedPropertyStep.ComputeAssignments,
  });

  const nowSeconds = now / 1000;

  for (const segment of segments) {
    const period = periodByComputedPropertyId.get(segment.id);
    const qb = new ClickHouseQueryBuilder();
    let query: string;
    const node = segment.definition.entryNode;

    let lowerBoundClause = period
      ? `and computed_at >= toDateTime64(${period.maxTo.getTime() / 1000}, 3)`
      : "";
    switch (node.type) {
      case SegmentNodeType.Trait: {
        const stateId = segmentNodeStateId(segment, node.id);
        let condition: string;
        let isTimeBounded = true;
        switch (node.operator.type) {
          case SegmentOperatorType.Equals: {
            const value = qb.addQueryValue(node.operator.value, "String");
            condition = `argMaxMerge(last_value) == ${value}`;
            break;
          }
          case SegmentOperatorType.NotEquals: {
            const value = qb.addQueryValue(node.operator.value, "String");
            condition = `argMaxMerge(last_value) != ${value}`;
            break;
          }
          case SegmentOperatorType.Within: {
            const lowerBound = Math.round(
              Math.max(nowSeconds - node.operator.windowSeconds, 0)
            );
            const name = getChCompatibleUuid();
            isTimeBounded = false;
            condition = `
              and(
                not(
                  isNull(
                    parseDateTime64BestEffortOrNull(argMaxMerge(last_value)) as ${name}
                  )
                ),
                ${name} >= toDateTime64(${lowerBound}, 3)
              )
            `;
            break;
          }
          case SegmentOperatorType.Exists: {
            condition = `argMaxMerge(last_value) != '""'`;
            break;
          }
          case SegmentOperatorType.HasBeen: {
            const upperBound = Math.max(
              nowSeconds - node.operator.windowSeconds,
              0
            );
            isTimeBounded = false;
            condition = `maxMerge(max_event_time) < toDateTime64(${upperBound}, 3) and argMaxMerge(last_value) == ${qb.addQueryValue(
              node.operator.value,
              "String"
            )}`;
            break;
          }
        }
        if (!isTimeBounded) {
          lowerBoundClause = "";
        }

        query = `
          insert into computed_property_assignments_v2
          select
            workspace_id,
            type,
            computed_property_id,
            user_id,
            ${condition} as segment_value,
            '' as user_property_value,
            maxMerge(max_event_time),
            toDateTime64(${nowSeconds}, 3) as assigned_at
          from computed_property_state
          where
            (
              workspace_id,
              type,
              computed_property_id,
              state_id,
              user_id
            ) in (
              select
                workspace_id,
                type,
                computed_property_id,
                state_id,
                user_id
              from updated_computed_property_state
              where
                workspace_id = ${qb.addQueryValue(workspaceId, "String")}
                and type = 'segment'
                and computed_property_id = ${qb.addQueryValue(
                  segment.id,
                  "String"
                )}
                and state_id = ${qb.addQueryValue(stateId, "String")}
                and computed_at <= toDateTime64(${nowSeconds}, 3)
                ${lowerBoundClause}
            )
          group by
            workspace_id,
            type,
            computed_property_id,
            user_id;
        `;
        break;
      }
      case SegmentNodeType.And: {
        const conditions: string[] = [];
        const childStateIds: string[] = [];

        for (const childId of node.children) {
          const childNode = segment.definition.nodes.find(
            (n) => n.id === childId
          );
          if (!childNode) {
            logger().error(
              {
                segment,
                childId,
                node,
              },
              "AND child node not found"
            );
            continue;
          }
          if (childNode.type !== SegmentNodeType.Trait) {
            throw new Error("not implemented");
          }
          if (childNode.operator.type !== SegmentOperatorType.Equals) {
            throw new Error("not implemented");
          }
          const childStateId = segmentNodeStateId(segment, childNode.id);
          const condition = `inner1.segment_values[${qb.addQueryValue(
            childStateId,
            "String"
          )}] == ${qb.addQueryValue(childNode.operator.value, "String")}`;

          conditions.push(condition);
          childStateIds.push(childStateId);
        }
        const condition = conditions.join(" and ");

        const lowerBoundClause = period
          ? `and computed_at >= toDateTime64(${
              period.maxTo.getTime() / 1000
            }, 3)`
          : "";

        const innerQuery = `
          select
            inner2.workspace_id as workspace_id,
            inner2.type as type,
            inner2.computed_property_id as computed_property_id,
            inner2.user_id as user_id,
            inner2.max_event_time as max_event_time,
            CAST(
              (
                groupArray(inner2.state_id),
                groupArray(inner2.last_value)
              ),
              'Map(String, String)'
            ) as segment_values
          from (
            select
              workspace_id,
              type,
              computed_property_id,
              user_id,
              state_id,
              argMaxMerge(last_value) as last_value,
              maxMerge(max_event_time) as max_event_time
            from computed_property_state
            where
              (
                workspace_id,
                type,
                computed_property_id,
                state_id,
                user_id
              ) in (
                select
                  workspace_id,
                  type,
                  computed_property_id,
                  state_id,
                  user_id
                from updated_computed_property_state
                where
                  workspace_id = ${qb.addQueryValue(workspaceId, "String")}
                  and type = 'segment'
                  and computed_property_id = ${qb.addQueryValue(
                    segment.id,
                    "String"
                  )}
                  and state_id in ${qb.addQueryValue(
                    childStateIds,
                    "Array(String)"
                  )}
                  and computed_at <= toDateTime64(${nowSeconds}, 3)
                  ${lowerBoundClause}
              )
            group by
              workspace_id,
              type,
              computed_property_id,
              state_id,
              user_id
          ) as inner2
          group by
            workspace_id,
            type,
            computed_property_id,
            max_event_time,
            user_id
        `;

        const selectQuery = `
          select
            inner1.workspace_id,
            inner1.type,
            inner1.computed_property_id,
            inner1.user_id,
            ${condition} as segment_value,
            '""' as user_property_value,
            inner1.max_event_time,
            toDateTime64(${nowSeconds}, 3) as assigned_at
          from (${innerQuery}) as inner1;
        `;

        query = `
          insert into computed_property_assignments_v2
          ${selectQuery}
        `;
        break;
      }
      default:
        throw new Error(
          `Unhandled user property type: ${segment.definition.entryNode.type}`
        );
    }

    queryies.push(
      clickhouseClient().command({
        query,
        query_params: qb.getQueries(),
        clickhouse_settings: { wait_end_of_query: 1 },
      })
    );
  }

  for (const userProperty of userProperties) {
    const period = periodByComputedPropertyId.get(userProperty.id);
    const lowerBoundClause = period
      ? `and computed_at >= toDateTime64(${period.maxTo.getTime() / 1000}, 3)`
      : "";
    let query: string;

    const qb = new ClickHouseQueryBuilder();
    switch (userProperty.definition.type) {
      case UserPropertyDefinitionType.Trait: {
        const stateId = uuidv5(
          userProperty.definitionUpdatedAt.toString(),
          userProperty.id
        );
        query = `
          insert into computed_property_assignments_v2
          select
            workspace_id,
            type,
            computed_property_id,
            user_id,
            False as segment_value,
            toJSONString(argMaxMerge(last_value)) as user_property_value,
            maxMerge(max_event_time) as max_event_time,
            toDateTime64(${nowSeconds}, 3) as assigned_at
          from computed_property_state
          where
            (
              workspace_id,
              type,
              computed_property_id,
              state_id,
              user_id
            ) in (
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
                and computed_property_id = ${qb.addQueryValue(
                  userProperty.id,
                  "String"
                )}
                and state_id = ${qb.addQueryValue(stateId, "String")}
                and computed_at <= toDateTime64(${nowSeconds}, 3)
                ${lowerBoundClause}
            )
          group by
            workspace_id,
            type,
            computed_property_id,
            user_id;
        `;
        break;
      }
      default:
        throw new Error(
          `Unhandled user property type: ${userProperty.definition.type}`
        );
    }
    queryies.push(
      clickhouseClient().command({
        query,
        query_params: qb.getQueries(),
        clickhouse_settings: { wait_end_of_query: 1 },
      })
    );
  }
  await Promise.all(queryies);

  await createPeriods({
    workspaceId,
    userProperties,
    segments,
    now,
    periodByComputedPropertyId,
    step: ComputedPropertyStep.ComputeAssignments,
  });
}

let LIMIT: pLimit.Limit | null = null;

function limit() {
  if (!LIMIT) {
    LIMIT = pLimit(config().readQueryConcurrency);
  }
  return LIMIT;
}

async function processRows({
  rows,
  workspaceId,
  subscribedJourneys,
}: {
  rows: unknown[];
  workspaceId: string;
  subscribedJourneys: JourneyResource[];
}): Promise<boolean> {
  logger().debug(
    {
      rows,
    },
    "processRows"
  );
  let hasRows = false;
  const assignments: ComputedAssignment[] = rows
    .map((json) => {
      const result = schemaValidateWithErr(json, ComputedAssignment);
      if (result.isErr()) {
        logger().error(
          { err: result.error, json },
          "failed to parse assignment json"
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
    "processing computed assignments"
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
        (j) => j.id === assignment.processed_for
      );
      if (!journey) {
        logger().error(
          {
            subscribedJourneys: subscribedJourneys.map((j) => j.id),
            processed_for: assignment.processed_for,
          },
          "journey in assignment.processed_for missing from subscribed journeys"
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
            "integration in assignment.processed_for missing from subscribed integrations"
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
    tableVersion: "v2",
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
}: {
  workspaceId: string;
  now: number;
  userProperties: SavedUserPropertyResource[];
  segments: SavedSegmentResource[];
  integrations: SavedIntegrationResource[];
  journeys: JourneyResource[];
}): Promise<void> {
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
    new Map()
  );

  const subscribedIntegrationUserPropertyMap = integrations.reduce<
    Map<string, Set<string>>
  >((memo, integration) => {
    integration.definition.subscribedUserProperties.forEach(
      (userPropertyName) => {
        const userPropertyId = userProperties.find(
          (up) => up.name === userPropertyName
        )?.id;
        if (!userPropertyId) {
          logger().info(
            { workspaceId, integration, userPropertyName },
            "integration subscribed to user property that doesn't exist"
          );
          return;
        }
        const processFor = memo.get(userPropertyId) ?? new Set();
        processFor.add(integration.name);
        memo.set(userPropertyId, processFor);
      }
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
          "integration subscribed to segment that doesn't exist"
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
    subscribedIntegrationSegmentMap
  )) {
    subscribedIntegrationSegmentKeys.push(segmentId);
    subscribedIntegrationSegmentValues.push(Array.from(integrationSet));
  }

  for (const [userPropertyId, integrationSet] of Array.from(
    subscribedIntegrationUserPropertyMap
  )) {
    subscribedIntegrationUserPropertyKeys.push(userPropertyId);
    subscribedIntegrationUserPropertyValues.push(Array.from(integrationSet));
  }

  const qb = new ClickHouseQueryBuilder();

  const subscribedJourneysKeysQuery = qb.addQueryValue(
    subscribedJourneyKeys,
    "Array(String)"
  );

  const subscribedJourneysValuesQuery = qb.addQueryValue(
    subscribedJourneyValues,
    "Array(Array(String))"
  );

  const subscribedIntegrationsUserPropertyKeysQuery = qb.addQueryValue(
    subscribedIntegrationUserPropertyKeys,
    "Array(String)"
  );

  const subscribedIntegrationsUserPropertyValuesQuery = qb.addQueryValue(
    subscribedIntegrationUserPropertyValues,
    "Array(Array(String))"
  );

  const subscribedIntegrationsSegmentKeysQuery = qb.addQueryValue(
    subscribedIntegrationSegmentKeys,
    "Array(String)"
  );

  const subscribedIntegrationsSegmentValuesQuery = qb.addQueryValue(
    subscribedIntegrationSegmentValues,
    "Array(Array(String))"
  );

  const workspaceIdParam = qb.addQueryValue(workspaceId, "String");

  const tmpTableName = `computed_properties_to_process_${getChCompatibleUuid()}`;
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
  const query = `
    CREATE TEMPORARY TABLE IF NOT EXISTS ${tmpTableName} AS
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
            AND cpa.processed_for_type != 'journey'
        )
    )
  `;

  const ch = createClickhouseClient({
    enableSession: true,
  });

  const tmpTableQueryId = uuidv4();
  try {
    try {
      await ch.command({
        query,
        query_id: tmpTableQueryId,
        query_params: qb.getQueries(),
        clickhouse_settings: { wait_end_of_query: 1 },
      });
    } catch (e) {
      logger().error(
        {
          workspaceId,
          queryId: tmpTableQueryId,
          err: e,
        },
        "failed read temp table"
      );
      throw e;
    }

    const { readQueryPageSize } = config();

    let offset = 0;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
      const paginatedReadQuery = `SELECT * FROM ${tmpTableName} LIMIT ${readQueryPageSize} OFFSET ${offset}`;

      let resultSet: Awaited<ReturnType<(typeof ch)["query"]>>;
      const pageQueryId = uuidv4();

      try {
        let receivedRows = 0;
        resultSet = await limit()(() =>
          ch.query({
            query: paginatedReadQuery,
            query_id: pageQueryId,
            format: "JSONEachRow",
            clickhouse_settings: { wait_end_of_query: 1 },
          })
        );

        try {
          await streamClickhouseQuery(resultSet, async (rows) => {
            receivedRows += rows.length;
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
              tmpTableQueryId,
            },
            "failed to process rows"
          );
        }

        // If no rows were fetched in this iteration, break out of the loop.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (receivedRows < readQueryPageSize) {
          debugger;
          break;
        }

        // Increment the offset by PAGE_SIZE to fetch the next set of rows in the next iteration.
        offset += readQueryPageSize;
      } catch (e) {
        logger().error(
          {
            workspaceId,
            queryId: pageQueryId,
            err: e,
            readQueryPageSize,
            offset,
          },
          "failed read query page"
        );
        throw e;
      }
      logger().info(
        {
          workspaceId,
          queryId: pageQueryId,
          readQueryPageSize,
          offset,
        },
        "read query page"
      );
    }
  } finally {
    const queryId = uuidv4();
    try {
      await ch.command({
        query: `DROP TABLE IF EXISTS ${tmpTableName}`,
        query_id: queryId,
      });
    } catch (e) {
      logger().error(
        {
          workspaceId,
          queryId,
          err: e,
        },
        "failed to cleanup temp table"
      );
    }
    logger().info(
      {
        workspaceId,
        queryId,
      },
      "cleanup temp table"
    );
  }

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
}
