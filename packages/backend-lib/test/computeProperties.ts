import { eq } from "drizzle-orm";

import { clickhouseClient, ClickHouseQueryBuilder } from "../src/clickhouse";
import { db } from "../src/db";
import * as schema from "../src/db/schema";
import {
  ComputedPropertyAssignment,
  ComputedPropertyPeriod,
} from "../src/types";

export async function getAssignmentUserCount(workspaceId: string) {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select uniqExact(user_id) as user_count
    from computed_property_assignments_v2
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
  `;
  const response = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
  });
  const values: { data: { user_count: number }[] } = await response.json();
  return Number(values.data[0]?.user_count ?? 0);
}

export async function getStateUserCount(workspaceId: string) {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select uniqExact(user_id) as user_count
    from computed_property_state_v3
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
  `;
  const response = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
  });
  const values: { data: { user_count: number }[] } = await response.json();
  return Number(values.data[0]?.user_count ?? 0);
}

export async function getEventsUserCount(workspaceId: string) {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select uniqExact(user_id) as user_count
    from user_events_v2
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
  `;
  const response = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
  });
  const values: { data: { user_count: number }[] } = await response.json();
  return Number(values.data[0]?.user_count ?? 0);
}

export async function getUserCounts(workspaceId: string) {
  const [stateUserCount, assignmentUserCount, eventsUserCount] =
    await Promise.all([
      getStateUserCount(workspaceId),
      getAssignmentUserCount(workspaceId),
      getEventsUserCount(workspaceId),
    ]);
  return {
    eventsUserCount,
    stateUserCount,
    assignmentUserCount,
  };
}

export async function readPeriods({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<ComputedPropertyPeriod[]> {
  const periods = await db()
    .select()
    .from(schema.computedPropertyPeriod)
    .where(eq(schema.computedPropertyPeriod.workspaceId, workspaceId));
  return periods;
}

export async function readUpdatedComputedPropertyState({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<
  {
    workspace_id: string;
    type: string;
    computed_property_id: string;
    state_id: string;
    user_id: string;
    computed_at: string;
  }[]
> {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select *
    from updated_computed_property_state
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
  `;
  const response = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
  });
  const values = await response.json<{
    workspace_id: string;
    type: string;
    computed_property_id: string;
    state_id: string;
    user_id: string;
    computed_at: string;
  }>();
  return values.data;
}

export async function readAssignments({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<ComputedPropertyAssignment[]> {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select *
    from computed_property_assignments_v2
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
    order by assigned_at desc
  `;
  const response = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
  });
  const values: { data: ComputedPropertyAssignment[] } = await response.json();
  return values.data;
}

export interface IndexedState {
  type: "segment" | "user_property";
  computed_property_id: string;
  state_id: string;
  user_id: string;
  indexed_value: string;
}

export async function readIndexed({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<IndexedState[]> {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select
      type,
      computed_property_id,
      state_id,
      user_id,
      indexed_value
    from computed_property_state_index
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
  `;
  const response = (await (
    await clickhouseClient().query({
      query,
      query_params: qb.getQueries(),
    })
  ).json()) satisfies { data: IndexedState[] };
  return response.data;
}
