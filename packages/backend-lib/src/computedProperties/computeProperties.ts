import { Prisma } from "@prisma/client";
import { mapValues } from "remeda";
import { v5 as uuidv5 } from "uuid";

import { clickhouseClient, ClickHouseQueryBuilder } from "../clickhouse";
import prisma from "../prisma";
import {
  ComputedPropertyPeriod,
  SavedSegmentResource,
  SavedUserPropertyResource,
  UserPropertyDefinitionType,
} from "../types";

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
        type,
        computed_property_id,
        user_id
      );
    `,
  ];

  await Promise.all(
    queries.map((query) =>
      clickhouseClient().exec({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      })
    )
  );
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
  ];

  await Promise.all(
    queries.map((query) =>
      clickhouseClient().exec({
        query,
        clickhouse_settings: { wait_end_of_query: 1 },
      })
    )
  );
}

interface SubQueryData {
  condition: string;
  type: "user_property" | "segment";
  computedPropertyId: string;
  stateId: string;
  argMaxValue?: string;
  uniqValue?: string;
}

type AggregatedComputedPropertyPeriod = Omit<
  ComputedPropertyPeriod,
  "from" | "workspaceId" | "to"
> & {
  maxTo: ComputedPropertyPeriod["to"];
};

enum ComputedPropertyStep {
  ComputeState = "ComputeState",
  WriteAssignments = "WriteAssignments",
  ProcessAssignments = "ProcessAssignments",
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
  const subQueryData: SubQueryData[] = [];

  for (const segment of segments) {
  }

  for (const userProperty of userProperties) {
    let subQuery: SubQueryData;
    switch (userProperty.definition.type) {
      case UserPropertyDefinitionType.Trait: {
        const stateId = uuidv5(
          userProperty.updatedAt.toString(),
          userProperty.id
        );
        subQuery = {
          condition: `(visitParamExtractString(properties, 'email') as email) != ''`,
          type: "user_property",
          uniqValue: "''",
          argMaxValue: "email",
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

  const periodsQuery = Prisma.sql`
    SELECT DISTINCT ON ("workspaceId", "type", "computedPropertyId")
      "type",
      "computedPropertyId",
      "version",
      MAX("to") OVER (PARTITION BY "workspaceId", "type", "computedPropertyId") as "maxTo"
    FROM "ComputedPropertyPeriod"
    WHERE
      "workspaceId" = CAST(${workspaceId} AS UUID)
      AND "step" = ${ComputedPropertyStep.ComputeState}
    ORDER BY "workspaceId", "type", "computedPropertyId", "to" DESC;
  `;
  const periods = await prisma().$queryRaw<AggregatedComputedPropertyPeriod[]>(
    periodsQuery
  );

  const periodByComputedPropertyId = periods.reduce<
    Map<
      string,
      Pick<
        AggregatedComputedPropertyPeriod,
        "maxTo" | "computedPropertyId" | "version"
      >
    >
  >((acc, period) => {
    const { maxTo } = period;
    acc.set(period.computedPropertyId, {
      maxTo,
      computedPropertyId: period.computedPropertyId,
      version: period.version,
    });
    return acc;
  }, new Map());

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
    mapValues(subQueriesWithPeriods, (periodSubQueries, period) => {
      const lowerBoundClause =
        period !== 0
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
                ${subQuery.argMaxValue},
                ${subQuery.uniqValue}
              ),
              (Null, Null, Null, Null, Null)
            )
          `
        )
        .join(", ");

      const query = `
        insert into computed_property_state
        select
          workspace_id,
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
          now64(3) as computed_at
        from user_events_v2
        where
          workspace_id = ${qb.addQueryValue(workspaceId, "String")}
          and processing_time < toDateTime64(${nowSeconds}, 3)
          ${lowerBoundClause}
        group by
          workspace_id,
          type,
          computed_property_id,
          state_id,
          user_id,
          processing_time;
      `;
      console.log(query);
      return clickhouseClient().exec({
        query,
        query_params: qb.getQueries(),
      });
    })
  );
  await Promise.all(queries);
  console.log("computeState done");
  // fixme write step
}

export async function computeAssignments({
  workspaceId,
  userProperties,
}: {
  workspaceId: string;
  userProperties: SavedUserPropertyResource[];
  segments: SavedSegmentResource[];
}): Promise<void> {
  const qb = new ClickHouseQueryBuilder();
  let queryies: Promise<unknown>[] = [];
  // FIXME get period
  for (const userProperty of userProperties) {
    let query: string;
    switch (userProperty.definition.type) {
      case UserPropertyDefinitionType.Trait: {
        const stateId = uuidv5(
          userProperty.updatedAt.toString(),
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
            argMaxMerge(last_value) as user_property_value,
            maxMerge(max_event_time) as max_event_time,
            now64(3) as assigned_at
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
    queryies.push(clickhouseClient().exec({ query }));
  }
  await Promise.all(queryies);
  // fixme write step
}

export interface ComputedPropertyAssignment {
  workspace_id: string;
  type: "segment" | "user_property";
  computed_property_id: string;
  user_id: string;
  segment_value: boolean;
  user_property_value: string;
  max_event_time: string;
  assigned_at: string;
}

export async function processAssignments() {}
