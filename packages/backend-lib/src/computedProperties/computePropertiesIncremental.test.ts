/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable no-await-in-loop */
import type { InspectOptions } from "node:util";
import { inspect } from "node:util";

import { randomUUID } from "crypto";
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import { asc, eq } from "drizzle-orm";
import { floorToNearest } from "isomorphic-lib/src/numbers";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { omit } from "remeda";

import {
  getUserCounts,
  IndexedState,
  readAssignments,
  readIndexed,
  readPeriods,
  readUpdatedComputedPropertyState,
} from "../../test/computeProperties";
import { submitBatch, TestEvent } from "../../test/testEvents";
import {
  clickhouseClient,
  clickhouseDateToIso,
  ClickHouseQueryBuilder,
} from "../clickhouse";
import { db, insert, upsert } from "../db";
import * as schema from "../db/schema";
import { toJourneyResource } from "../journeys";
import logger from "../logger";
import { findAllSegmentAssignments, toSegmentResource } from "../segments";
import {
  AppFileType,
  BlobStorageFile,
  ComputedPropertyStep,
  ComputedPropertyStepEnum,
  CursorDirectionEnum,
  EventType,
  InternalEventType,
  JourneyDefinition,
  JourneyNodeType,
  JSONValue,
  ParsedPerformedManyValueItem,
  PerformedUserPropertyDefinition,
  RelationalOperators,
  SavedHasStartedJourneyResource,
  SavedJourneyResource,
  SavedSegmentResource,
  SavedUserPropertyResource,
  SegmentHasBeenOperatorComparator,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentResource,
  SubscriptionChange,
  SubscriptionChangeEvent,
  SubscriptionGroupType,
  UserPropertyDefinitionType,
  UserPropertyOperatorType,
  UserPropertyResource,
  Workspace,
} from "../types";
import {
  findAllUserPropertyAssignments,
  toSavedUserPropertyResource,
} from "../userProperties";
import type { ComputePropertiesArgs } from "./computePropertiesIncremental";
import {
  segmentNodeStateId,
  userPropertyStateId,
} from "./computePropertiesIncremental";

const signalWithStart = jest.fn();
const signal = jest.fn();

const getHandle = jest.fn(() => ({
  signal,
}));

jest.mock("../temporal/activity", () => ({
  getContext: () => ({
    workflowClient: {
      signalWithStart,
      getHandle,
    },
  }),
}));

interface State {
  type: "segment" | "user_property";
  computed_property_id: string;
  state_id: string;
  user_id: string;
  max_event_time: string;
  computed_at: string;
  last_value: string;
  unique_count: string;
  grouped_message_ids: string[];
}

interface DisaggregatedState {
  workspace_id: string;
  type: "segment" | "user_property";
  computed_property_id: string;
  state_id: string;
  user_id: string;
  last_value: string;
  unique_count: string;
  grouped_message_ids: string[];
  computed_at: string;
  event_time: string;
}

async function readDisaggregatedStates({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<DisaggregatedState[]> {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select
      workspace_id,
      type,
      computed_property_id,
      state_id,
      user_id,
      argMaxMerge(last_value) as last_value,
      uniqMerge(unique_count) as unique_count,
      groupArrayMerge(grouped_message_ids) as grouped_message_ids,
      computed_at,
      event_time
    from computed_property_state_v3
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
    group by
      workspace_id,
      type,
      computed_property_id,
      state_id,
      user_id,
      computed_at,
      event_time
    order by computed_at desc
  `;
  const response = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
  });
  const values: { data: DisaggregatedState[] } = await response.json();
  return values.data;
}

async function readStates({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<State[]> {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select
      workspace_id,
      type,
      computed_property_id,
      state_id,
      user_id,
      argMaxMerge(last_value) as last_value,
      uniqMerge(unique_count) as unique_count,
      max(event_time) as max_event_time,
      groupArrayMerge(grouped_message_ids) as grouped_message_ids,
      max(computed_at),
      groupArray(event_time) as event_times
    from computed_property_state_v3
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
    group by
      workspace_id,
      type,
      computed_property_id,
      state_id,
      user_id
  `;
  const response = (await (
    await clickhouseClient().query({
      query,
      query_params: qb.getQueries(),
    })
  ).json()) satisfies { data: State[] };
  return response.data;
}

interface TestState {
  type: "segment" | "user_property";
  userId: string;
  name: string;
  nodeId?: string;
  lastValue?: string;
  uniqueCount?: number;
  maxEventTime?: string;
}

interface TestIndexedState {
  type: "segment" | "user_property";
  userId: string;
  name: string;
  nodeId?: string;
  indexedValue: number;
}

interface ResolvedSegmentState {
  segment_id: string;
  state_id: string;
  user_id: string;
  segment_state_value: boolean;
}

interface TestResolvedSegmentState {
  userId: string;
  name: string;
  nodeId: string;
  segmentStateValue: boolean;
}

async function readResolvedSegmentStates({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<(ResolvedSegmentState & { computed_at: string })[]> {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select
      segment_id,
      state_id,
      user_id,
      segment_state_value,
      computed_at
    from resolved_segment_state
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
  `;
  const response = (await (
    await clickhouseClient().query({
      query,
      query_params: qb.getQueries(),
    })
  ).json()) satisfies {
    data: (ResolvedSegmentState & { computed_at: string })[];
  };

  return response.data;
}

function toTestResolvedSegmentState(
  resolvedSegmentState: ResolvedSegmentState,
  segments: SavedSegmentResource[],
): TestResolvedSegmentState | null {
  const segment = segments.find(
    (s) => s.id === resolvedSegmentState.segment_id,
  );
  if (!segment) {
    throw new Error("segment not found");
  }
  const nodes = [segment.definition.entryNode, ...segment.definition.nodes];

  const nodeId = nodes.find((n) => {
    const stateId = segmentNodeStateId(segment, n.id);
    return resolvedSegmentState.state_id === stateId;
  })?.id;

  if (!nodeId) {
    return null;
  }
  return {
    userId: resolvedSegmentState.user_id,
    name: segment.name,
    nodeId,
    segmentStateValue: resolvedSegmentState.segment_state_value,
  };
}

function toTestIndexedState(
  indexedState: IndexedState,
  userProperties: SavedUserPropertyResource[],
  segments: SavedSegmentResource[],
): TestIndexedState {
  const indexedValue = parseInt(indexedState.indexed_value, 10);
  switch (indexedState.type) {
    case "segment": {
      const segment = segments.find(
        (s) => s.id === indexedState.computed_property_id,
      );
      if (!segment) {
        throw new Error("segment not found");
      }
      const nodeId = [
        segment.definition.entryNode,
        ...segment.definition.nodes,
      ].find((n) => {
        const stateId = segmentNodeStateId(segment, n.id);
        return indexedState.state_id === stateId;
      })?.id;

      return {
        type: "segment",
        name: segment.name,
        nodeId,
        userId: indexedState.user_id,
        indexedValue,
      };
    }
    case "user_property": {
      const userProperty: SavedUserPropertyResource | undefined =
        userProperties.find(
          (up) => up.id === indexedState.computed_property_id,
        );
      if (!userProperty) {
        throw new Error("userProperty not found");
      }
      let nodeId: string | undefined;
      if (userProperty.definition.type === UserPropertyDefinitionType.Group) {
        nodeId = userProperty.definition.nodes.find(
          (n) =>
            userPropertyStateId(userProperty, n.id) === indexedState.state_id,
        )?.id;
      }
      return {
        type: "user_property",
        name: userProperty.name,
        userId: indexedState.user_id,
        nodeId,
        indexedValue,
      };
    }
  }
}

function toTestState(
  state: State,
  userProperties: SavedUserPropertyResource[],
  segments: SavedSegmentResource[],
): TestState {
  const maxEventTime = clickhouseDateToIso(state.max_event_time);
  switch (state.type) {
    case "segment": {
      const segment = segments.find((s) => s.id === state.computed_property_id);
      if (!segment) {
        throw new Error("segment not found");
      }
      const nodeId = [
        segment.definition.entryNode,
        ...segment.definition.nodes,
      ].find((n) => {
        const stateId = segmentNodeStateId(segment, n.id);
        return state.state_id === stateId;
      })?.id;

      return {
        type: "segment",
        name: segment.name,
        nodeId,
        lastValue: state.last_value,
        uniqueCount: Number(state.unique_count),
        userId: state.user_id,
        maxEventTime,
      };
    }
    case "user_property": {
      const userProperty: SavedUserPropertyResource | undefined =
        userProperties.find((up) => up.id === state.computed_property_id);
      if (!userProperty) {
        throw new Error(
          `userProperty not found for state:\n  properties:\n${userProperties.map((up) => `- ${up.name}\n`).join()}`,
        );
      }
      let nodeId: string | undefined;
      if (userProperty.definition.type === UserPropertyDefinitionType.Group) {
        nodeId = userProperty.definition.nodes.find(
          (n) => userPropertyStateId(userProperty, n.id) === state.state_id,
        )?.id;
      }
      return {
        type: "user_property",
        name: userProperty.name,
        lastValue: state.last_value,
        uniqueCount: Number(state.unique_count),
        userId: state.user_id,
        nodeId,
        maxEventTime,
      };
    }
  }
}

interface TableUser {
  id: string;
  properties?: Record<string, JSONValue>;
  segments?: Record<string, boolean | null>;
}

enum EventsStepType {
  SubmitEvents = "SubmitEvents",
  SubmitEventsTimes = "SubmitEventsTimes",
  ComputeProperties = "ComputeProperties",
  Assert = "Assert",
  Sleep = "Sleep",
  Debug = "Debug",
  UpdateComputedProperty = "UpdateComputedProperty",
  UpdateJourney = "UpdateJourney",
  Delay = "Delay",
}

type ClickhouseModule = typeof import("../clickhouse");
type CommandCallArgs = Parameters<ClickhouseModule["command"]>;
type QueryCallArgs = Parameters<ClickhouseModule["query"]>;

interface ClickhouseCommandCall {
  params: CommandCallArgs[0];
  options: Record<string, unknown> | undefined;
}

interface ClickhouseQueryCall {
  params: QueryCallArgs[0];
  options: Record<string, unknown> | undefined;
}

interface ClickhouseCounters {
  commands: number;
  queries: number;
  commandCalls: ClickhouseCommandCall[];
  queryCalls: ClickhouseQueryCall[];
}

const INSPECT_OPTIONS: InspectOptions = {
  depth: 4,
  breakLength: 120,
  compact: false,
};

function sanitizeOptions(
  options: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!options) {
    return options;
  }
  const { clickhouseClient, ...rest } = options;
  void clickhouseClient;
  if (Object.keys(rest).length === 0) {
    return undefined;
  }
  return rest;
}

function renderClickhouseCalls(
  calls: ClickhouseCommandCall[] | ClickhouseQueryCall[],
  type: "command" | "query",
): string {
  if (calls.length === 0) {
    return `no ${type}s recorded`;
  }
  return calls
    .map((call, index) => {
      const lines: string[] = [`#${index + 1}`];
      const params = call.params;
      if (params && typeof params === "object") {
        const { query, ...rest } = params as Record<string, unknown>;
        if (typeof query === "string") {
          lines.push(`query:\n${query}`);
        } else if (query !== undefined) {
          lines.push(`query: ${inspect(query, INSPECT_OPTIONS)}`);
        }
        if (Object.keys(rest).length > 0) {
          lines.push(`params: ${inspect(rest, INSPECT_OPTIONS)}`);
        }
      } else {
        lines.push(`params: ${inspect(params, INSPECT_OPTIONS)}`);
      }
      if (call.options !== undefined) {
        lines.push(`options: ${inspect(call.options, INSPECT_OPTIONS)}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function buildClickhouseExpectationMessage({
  description,
  expected,
  actual,
  type,
  calls,
}: {
  description?: string;
  expected: number;
  actual: number;
  type: "command" | "query";
  calls: ClickhouseCommandCall[] | ClickhouseQueryCall[];
}): string {
  const prefix = description ? `${description} - ` : "";
  const label =
    type === "command"
      ? "ClickHouse command count mismatch"
      : "ClickHouse query count mismatch";
  const renderedCalls = renderClickhouseCalls(calls, type);
  return `${prefix}${label}\nExpected: ${expected}\nActual: ${actual}\nObserved calls:\n${renderedCalls}`;
}

interface StepContext {
  now: number;
  workspace: Workspace;
  segments: SavedSegmentResource[];
  clickhouseCounters: ClickhouseCounters;
}

type EventBuilder = (ctx: StepContext) => TestEvent;

interface SubmitEventsStep {
  type: EventsStepType.SubmitEvents;
  events: (TestEvent | EventBuilder)[];
}

interface SubmitEventsTimesStep {
  type: EventsStepType.SubmitEventsTimes;
  times: number;
  events: ((ctx: StepContext, i: number) => TestEvent)[];
}

interface ComputePropertiesStep {
  type: EventsStepType.ComputeProperties;
}

interface DebugAssignmentsStep {
  type: EventsStepType.Debug;
  userId?: string;
  description?: string;
  queries?: ((
    ctx: StepContext,
    qb: ClickHouseQueryBuilder,
  ) => {
    query: string;
    name: string;
  })[];
}

// Wait in real time
interface DelayStep {
  type: EventsStepType.Delay;
  timeMs: number;
}

// Wait in test time
interface SleepStep {
  type: EventsStepType.Sleep;
  timeMs: number;
}

interface TestPeriod {
  from?: number;
  to: number;
  step: ComputedPropertyStep;
}

interface TestSignals {
  journeyName: string;
  times?: number;
}

interface AssertStep {
  type: EventsStepType.Assert;
  description?: string;
  users?: (TableUser | ((ctx: StepContext) => TableUser))[];
  userCount?: number;
  userPropertyUserCount?: number;
  states?: (TestState | ((ctx: StepContext) => TestState))[];
  periods?: TestPeriod[];
  journeys?: TestSignals[];
  resolvedSegmentStates?: TestResolvedSegmentState[];
  indexedStates?: (
    | TestIndexedState
    | ((ctx: StepContext) => TestIndexedState)
  )[];
  clickhouseCounts?: Partial<ClickhouseCounters>;
}

type TestUserProperty = Pick<UserPropertyResource, "name" | "definition">;
type TestSegment = Pick<SegmentResource, "name" | "definition">;
type TestJourneyResource = Pick<SavedJourneyResource, "name" | "definition">;

interface TestJourney {
  name: string;
  entrySegmentName: string;
}

interface UpdateComputedPropertyStep {
  type: EventsStepType.UpdateComputedProperty;
  updater?: (ctx: StepContext) => {
    userProperties?: TestUserProperty[];
    segments?: TestSegment[];
  };
  userProperties?: TestUserProperty[];
  segments?: TestSegment[];
}

interface UpdateJourneyStep {
  type: EventsStepType.UpdateJourney;
  journeys: (
    | TestJourneyResource
    | ((ctx: StepContext) => TestJourneyResource)
  )[];
}

type TableStep =
  | SubmitEventsStep
  | SubmitEventsTimesStep
  | ComputePropertiesStep
  | AssertStep
  | SleepStep
  | DebugAssignmentsStep
  | UpdateComputedPropertyStep
  | DelayStep
  | UpdateJourneyStep;

interface TableTest {
  description: string;
  skip?: true;
  only?: true;
  userProperties?: TestUserProperty[];
  segments?: TestSegment[];
  journeys?: TestJourney[];
  steps: TableStep[];
}

async function runComputePropertiesIncrementalWithCounters({
  args,
  counters,
}: {
  args: ComputePropertiesArgs;
  counters: ClickhouseCounters;
}): Promise<void> {
  let computation: Promise<void> | undefined;

  jest.isolateModules(() => {
    const actualClickhouse = jest.requireActual(
      "../clickhouse",
    ) as typeof import("../clickhouse");

    jest.doMock("../clickhouse", () => ({
      ...actualClickhouse,
      command: (
        ...commandArgs: Parameters<typeof actualClickhouse.command>
      ) => {
        counters.commands += 1;
        const [params, options] = commandArgs;
        counters.commandCalls.push({
          params,
          options: sanitizeOptions(options),
        });
        return actualClickhouse.command(...commandArgs);
      },
      query: (...queryArgs: Parameters<typeof actualClickhouse.query>) => {
        counters.queries += 1;
        const [params, options] = queryArgs;
        counters.queryCalls.push({
          params,
          options: sanitizeOptions(options),
        });
        return actualClickhouse.query(...queryArgs);
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const workflow =
      require("./computePropertiesWorkflow/activities/computeProperties") as typeof import("./computePropertiesWorkflow/activities/computeProperties");
    computation = workflow.computePropertiesIncremental(args);
  });

  if (!computation) {
    throw new Error("computePropertiesIncremental failed to initialize");
  }

  jest.dontMock("../clickhouse");

  try {
    await computation;
  } finally {
    jest.resetModules();
  }
}

async function upsertJourneys({
  workspaceId,
  now,
  journeys,
  context,
}: {
  workspaceId: string;
  journeys: (
    | TestJourneyResource
    | ((ctx: StepContext) => TestJourneyResource)
  )[];
  now: number;
  context: StepContext;
}): Promise<SavedHasStartedJourneyResource[]> {
  await Promise.all(
    journeys.map((j) => {
      const resource = typeof j === "function" ? j(context) : j;
      return upsert({
        table: schema.journey,
        target: [schema.journey.workspaceId, schema.journey.name],
        values: {
          id: randomUUID(),
          workspaceId,
          name: resource.name,
          status: "Running",
          definition: resource.definition,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
        set: {
          updatedAt: new Date(now),
        },
      });
    }),
  );
  const journeyModels = await db()
    .select()
    .from(schema.journey)
    .where(eq(schema.journey.workspaceId, workspaceId));
  return journeyModels.map((j) => {
    const resource = unwrap(toJourneyResource(j));
    if (resource.status === "NotStarted") {
      throw new Error("journey should have been started");
    }
    return resource;
  });
}

async function upsertComputedProperties({
  workspaceId,
  segments,
  userProperties,
  now,
}: {
  workspaceId: string;
  segments: TestSegment[];
  userProperties: TestUserProperty[];
  now: number;
}): Promise<{
  segments: SavedSegmentResource[];
  userProperties: SavedUserPropertyResource[];
}> {
  await Promise.all([
    ...userProperties.map((up) =>
      upsert({
        table: schema.userProperty,
        target: [schema.userProperty.workspaceId, schema.userProperty.name],
        values: {
          id: randomUUID(),
          workspaceId,
          name: up.name,
          definition: up.definition,
          definitionUpdatedAt: new Date(now),
          updatedAt: new Date(now),
          createdAt: new Date(now),
        },
        set: {
          definition: up.definition,
          updatedAt: new Date(now),
          definitionUpdatedAt: new Date(now),
        },
      }),
    ),
    ...segments.map((s) =>
      upsert({
        table: schema.segment,
        target: [schema.segment.workspaceId, schema.segment.name],
        values: {
          id: randomUUID(),
          workspaceId,
          name: s.name,
          definition: s.definition,
          definitionUpdatedAt: new Date(now),
          updatedAt: new Date(now),
          createdAt: new Date(now),
        },
        set: {
          definition: s.definition,
          updatedAt: new Date(now),
          definitionUpdatedAt: new Date(now),
        },
      }),
    ),
  ]);
  const [segmentModels, userPropertyModels] = await Promise.all([
    db()
      .select()
      .from(schema.segment)
      .where(eq(schema.segment.workspaceId, workspaceId)),
    db()
      .select()
      .from(schema.userProperty)
      .where(eq(schema.userProperty.workspaceId, workspaceId)),
  ]);
  const segmentResources = segmentModels.map((s) =>
    unwrap(toSegmentResource(s)),
  );

  const userPropertyResources = userPropertyModels.map((up) =>
    unwrap(toSavedUserPropertyResource(up)),
  );
  return {
    segments: segmentResources,
    userProperties: userPropertyResources,
  };
}

jest.setTimeout(3000000);

describe("computeProperties", () => {
  const tests: TableTest[] = [
    {
      description: "computes a trait user property",
      userProperties: [
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email: "test@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                email: "test@email.com",
                id: "user-1",
              },
            },
          ],
          states: [
            {
              userId: "user-1",
              type: "user_property",
              lastValue: "test@email.com",
              name: "email",
            },
          ],
        },
      ],
    },
    {
      description:
        "prunes a trait user property from recomputation when no events are received",
      userProperties: [
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
      ],
      segments: [],
      steps: [
        {
          // ensure next period bound is after created at date of user property
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email: "test@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "computes user property correctly initially",
          users: [
            {
              id: "user-1",
              properties: {
                email: "test@email.com",
                id: "user-1",
              },
            },
          ],
          states: [
            {
              userId: "user-1",
              type: "user_property",
              lastValue: "test@email.com",
              name: "email",
            },
          ],
          clickhouseCounts: {
            commands: 2,
          },
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "does not recompute a trait user property when no events are received",
          clickhouseCounts: {
            commands: 2,
          },
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                unrelatedTrait: "unrelated",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test",
              properties: {
                email: "test@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "does not recompute a trait user property when the received events don't match the user property path or event type",
          clickhouseCounts: {
            commands: 2,
          },
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email: "test2@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "recomputes a trait user property when the received events match the user property path or event type",
          clickhouseCounts: {
            commands: 4,
          },
          users: [
            {
              id: "user-1",
              properties: {
                email: "test2@email.com",
                id: "user-1",
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "prunes an anyof trait user property from recomputation when no events are received",
      userProperties: [
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Group,
            entry: "1",
            nodes: [
              {
                type: UserPropertyDefinitionType.AnyOf,
                id: "1",
                children: ["2", "3"],
              },
              {
                type: UserPropertyDefinitionType.Trait,
                id: "2",
                path: "email1",
              },
              {
                type: UserPropertyDefinitionType.Trait,
                id: "3",
                path: "email2",
              },
            ],
          },
        },
      ],
      segments: [],
      steps: [
        {
          // ensure next period bound is after created at date of user property
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email1: "test@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "computes user property correctly initially",
          users: [
            {
              id: "user-1",
              properties: {
                email: "test@email.com",
                id: "user-1",
              },
            },
          ],
          clickhouseCounts: {
            commands: 3,
          },
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "does not recompute an anyof trait user property when no events are received",
          clickhouseCounts: {
            commands: 3,
          },
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                unrelatedTrait: "unrelated",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test",
              properties: {
                email1: "test@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "does not recompute an anyof trait user property when the received events don't match the user property path or event type",
          clickhouseCounts: {
            commands: 3,
          },
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email1: "test2@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "recomputes an anyof trait user property when the received events match the user property path or event type",
          clickhouseCounts: {
            commands: 5,
          },
          users: [
            {
              id: "user-1",
              properties: {
                email: "test2@email.com",
                id: "user-1",
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "prunes a grouped trait segment from recomputation when no events are received",
      userProperties: [],
      segments: [
        {
          name: "andSegment",
          definition: {
            entryNode: {
              type: SegmentNodeType.And,
              id: "1",
              children: ["2", "3"],
            },
            nodes: [
              {
                type: SegmentNodeType.Trait,
                id: "2",
                path: "env",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "test",
                },
              },
              {
                type: SegmentNodeType.Trait,
                id: "3",
                path: "status",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "running",
                },
              },
            ],
          },
        },
      ],
      steps: [
        {
          // ensure next period bound is after created at date of user property
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "test",
                status: "running",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "computes grouped trait segment correctly initially",
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: true,
              },
            },
          ],
          clickhouseCounts: {
            commands: 5,
          },
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "does not recompute a grouped trait segment when no events are received",
          clickhouseCounts: {
            commands: 5,
          },
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                unrelatedTrait: "unrelated",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test",
              properties: {
                env: "prod",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "does not recompute a grouped trait segment when the received events don't match the user property path or event type",
          clickhouseCounts: {
            commands: 5,
          },
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "test",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "recomputes grouped trait segment when the received events match the user property path or event type",
          clickhouseCounts: {
            commands: 8,
          },
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "computes a trait user property with concurrent empty event",
      userProperties: [
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email: "test@email.com",
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -50,
              userId: "user-1",
              traits: {},
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                email: "test@email.com",
                id: "user-1",
              },
            },
          ],
          states: [
            {
              userId: "user-1",
              type: "user_property",
              lastValue: "test@email.com",
              name: "email",
            },
          ],
        },
      ],
    },
    {
      description: "computes a segment that matches everyone",
      segments: [
        {
          name: "everyone",
          definition: {
            entryNode: {
              type: SegmentNodeType.Everyone,
              id: randomUUID(),
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEventsTimes,
          times: 100,
          events: [
            (_ctx, i) => ({
              type: EventType.Identify,
              offsetMs: -100,
              userId: `user-${i}`,
            }),
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          userCount: 100,
          userPropertyUserCount: 0,
        },
      ],
    },
    {
      description:
        "can efficiently process a large number of user property assignments without OOM'ing",
      skip: true,
      userProperties: [
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEventsTimes,
          // NODE_OPTIONS="--max-old-space-size=750" yarn jest packages/backend-lib/src/computedProperties/computePropertiesIncremental.test.t
          times: 4000000,
          events: [
            (_ctx, i) => ({
              type: EventType.Identify,
              offsetMs: -100,
              userId: `user-${i}`,
              traits: {
                email: `test${i}@email.com`,
              },
            }),
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          userCount: 4000000,
        },
      ],
    },
    {
      description: "does not throw with an invalid trait user property",
      userProperties: [
        {
          name: "invalid",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "a[..email",
          },
        },
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                foo: "bar",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                id: "user-1",
              },
            },
          ],
        },
      ],
    },
    {
      description: "computes a trait user property over multiple periods",
      userProperties: [
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email: "test1@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                email: "test1@email.com",
              },
            },
          ],
          periods: [
            {
              to: 0,
              step: ComputedPropertyStepEnum.ComputeState,
            },
            {
              to: 0,
              step: ComputedPropertyStepEnum.ComputeAssignments,
            },
            {
              to: 0,
              step: ComputedPropertyStepEnum.ProcessAssignments,
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email: "test2@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                email: "test2@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                email: "test2@email.com",
              },
            },
          ],
          periods: [
            {
              to: -1000,
              step: ComputedPropertyStepEnum.ComputeState,
            },
            {
              to: -1000,
              step: ComputedPropertyStepEnum.ComputeAssignments,
            },
            {
              to: -1000,
              step: ComputedPropertyStepEnum.ProcessAssignments,
            },
            {
              from: -1000,
              to: 0,
              step: ComputedPropertyStepEnum.ComputeState,
            },
            {
              from: -1000,
              to: 0,
              step: ComputedPropertyStepEnum.ComputeAssignments,
            },
            {
              from: -1000,
              to: 0,
              step: ComputedPropertyStepEnum.ProcessAssignments,
            },
          ],
        },
      ],
    },
    {
      description: "computes a trait segment",
      userProperties: [],
      segments: [
        {
          name: "test",
          definition: {
            entryNode: {
              type: SegmentNodeType.Trait,
              id: randomUUID(),
              path: "env",
              operator: {
                type: SegmentOperatorType.Equals,
                value: "test",
              },
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "test",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user is initially in the segment when they match",
          users: [
            {
              id: "user-1",
              segments: {
                test: true,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "does not match",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user is no longer in the segment when they no longer match",
          users: [
            {
              id: "user-1",
              segments: {
                test: null,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "computes a trait segment which is defined after the relevant event has been issued",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "test",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user initially is not in the segment before it is defined",
          users: [
            {
              id: "user-1",
              segments: {},
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.UpdateComputedProperty,
          segments: [
            {
              name: "test",
              definition: {
                entryNode: {
                  type: SegmentNodeType.Trait,
                  id: "1",
                  path: "env",
                  operator: {
                    type: SegmentOperatorType.Equals,
                    value: "test",
                  },
                },
                nodes: [],
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user is in the segment after it is defined",
          users: [
            {
              id: "user-1",
              segments: {
                test: true,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "does not match",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user is no longer in the segment when they no longer match",
          users: [
            {
              id: "user-1",
              segments: {
                test: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "computes a trait segment with the greater than operator",
      userProperties: [],
      segments: [
        {
          name: "test",
          definition: {
            entryNode: {
              type: SegmentNodeType.Trait,
              id: "0",
              path: "age",
              operator: {
                type: SegmentOperatorType.GreaterThanOrEqual,
                value: 20.5,
              },
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                age: 21.5,
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user is initially in the segment when they match",
          states: [
            {
              type: "segment",
              userId: "user-1",
              name: "test",
              nodeId: "0",
              lastValue: "21.5",
            },
          ],
          resolvedSegmentStates: [
            {
              userId: "user-1",
              name: "test",
              nodeId: "0",
              segmentStateValue: true,
            },
          ],
          users: [
            {
              id: "user-1",
              segments: {
                test: true,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                age: 19.5,
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user is no longer in the segment when they no longer match",
          users: [
            {
              id: "user-1",
              segments: {
                test: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "computes a trait segment with the less than operator",
      userProperties: [],
      segments: [
        {
          name: "test",
          definition: {
            entryNode: {
              type: SegmentNodeType.Trait,
              id: "0",
              path: "age",
              operator: {
                type: SegmentOperatorType.LessThan,
                value: 20.5,
              },
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                age: 19.5,
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user is initially in the segment when they match",
          states: [
            {
              type: "segment",
              userId: "user-1",
              name: "test",
              nodeId: "0",
              lastValue: "19.5",
            },
          ],
          resolvedSegmentStates: [
            {
              userId: "user-1",
              name: "test",
              nodeId: "0",
              segmentStateValue: true,
            },
          ],
          users: [
            {
              id: "user-1",
              segments: {
                test: true,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                age: 21.5,
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user is no longer in the segment when they no longer match",
          users: [
            {
              id: "user-1",
              segments: {
                test: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "computes a nested trait segment",
      userProperties: [],
      segments: [
        {
          name: "test",
          definition: {
            entryNode: {
              type: SegmentNodeType.Trait,
              id: randomUUID(),
              path: "a.b",
              operator: {
                type: SegmentOperatorType.Equals,
                value: "c",
              },
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                a: {
                  b: "c",
                },
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                test: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "computes an AND segment",
      userProperties: [],
      segments: [
        {
          name: "andSegment",
          definition: {
            entryNode: {
              type: SegmentNodeType.And,
              id: "1",
              children: ["2", "3"],
            },
            nodes: [
              {
                type: SegmentNodeType.Trait,
                id: "2",
                path: "env",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "test",
                },
              },
              {
                type: SegmentNodeType.Trait,
                id: "3",
                path: "status",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "running",
                },
              },
            ],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "test",
                status: "running",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: true,
              },
            },
          ],
          states: [
            {
              type: "segment",
              userId: "user-1",
              name: "andSegment",
              nodeId: "2",
              lastValue: "test",
            },
            {
              type: "segment",
              userId: "user-1",
              name: "andSegment",
              nodeId: "3",
              lastValue: "running",
            },
          ],
        },
      ],
    },
    {
      description:
        "computes an AND segment with a mixture of trait and performed nodes",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "andSegment",
          definition: {
            entryNode: {
              type: SegmentNodeType.And,
              id: "1",
              children: ["2", "3"],
            },
            nodes: [
              {
                type: SegmentNodeType.Trait,
                id: "2",
                path: "env",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "test",
                },
              },
              {
                type: SegmentNodeType.Performed,
                id: "3",
                event: "test",
              },
            ],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "test",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "invalid",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user-1 is in the segment because they have the trait and performed event",
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: true,
              },
            },
            {
              id: "user-2",
              segments: {
                andSegment: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "assigments remain the same after computed properties are re-run",
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: true,
              },
            },
            {
              id: "user-2",
              segments: {
                andSegment: null,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "computes an AND segment with a mixture of trait and windowed performed nodes",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "andSegment",
          definition: {
            entryNode: {
              type: SegmentNodeType.And,
              id: "1",
              children: ["2", "3"],
            },
            nodes: [
              {
                type: SegmentNodeType.Trait,
                id: "2",
                path: "env",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "test",
                },
              },
              {
                type: SegmentNodeType.Performed,
                id: "3",
                event: "test",
                timesOperator: RelationalOperators.GreaterThanOrEqual,
                times: 1,
                withinSeconds: 5,
              },
            ],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "test",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "invalid",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user-1 is in the segment because they have the trait and performed event",
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: true,
              },
            },
            {
              id: "user-2",
              segments: {
                andSegment: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "assigments remain the same after computed properties are re-run",
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: true,
              },
            },
            {
              id: "user-2",
              segments: {
                andSegment: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 6000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user-1 is no longer in the segment because the performed event is no longer within the window",
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: null,
              },
            },
            {
              id: "user-2",
              segments: {
                andSegment: null,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "computes an AND segment with a mixture of trait and zero-times windowed performed nodes",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "andSegment",
          definition: {
            entryNode: {
              type: SegmentNodeType.And,
              id: "1",
              children: ["2", "3"],
            },
            nodes: [
              {
                type: SegmentNodeType.Trait,
                id: "2",
                path: "env",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "test",
                },
              },
              {
                type: SegmentNodeType.Performed,
                id: "3",
                event: "test",
                timesOperator: RelationalOperators.Equals,
                times: 0,
                withinSeconds: 5,
              },
            ],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "test",
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-2",
              traits: {
                env: "test",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "test",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-3",
              traits: {
                env: "prod",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user-1 is in the segment because they have the trait and have performed the event 0 times",
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: true,
              },
            },
            {
              id: "user-2",
              segments: {
                andSegment: null,
              },
            },
            {
              id: "user-3",
              segments: {
                andSegment: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "assigments remain the same after computed properties are re-run",
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: true,
              },
            },
            {
              id: "user-2",
              segments: {
                andSegment: null,
              },
            },
            {
              id: "user-3",
              segments: {
                andSegment: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 6000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user-2 is in the segment because their event has fallen out of the window",
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: true,
              },
            },
            {
              id: "user-2",
              segments: {
                andSegment: true,
              },
            },
            {
              id: "user-3",
              segments: {
                andSegment: null,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "computes an AND segment correctly when one node is updated from false to true",
      userProperties: [],
      segments: [
        {
          name: "andSegment",
          definition: {
            entryNode: {
              type: SegmentNodeType.And,
              id: "1",
              children: ["2", "3"],
            },
            nodes: [
              {
                type: SegmentNodeType.Trait,
                id: "2",
                path: "env",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "test",
                },
              },
              {
                type: SegmentNodeType.Trait,
                id: "3",
                path: "status",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "running",
                },
              },
            ],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "test",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user is initially not in the segment with only one of the required traits",
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 500,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                status: "running",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user is in the segment after receiving the second trait",
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: true,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 500,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                status: "stopped",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user is not in the segment again after having their trait changed to a non-matching value",
          users: [
            {
              id: "user-1",
              segments: {
                andSegment: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "computes within operator trait segment",
      userProperties: [],
      segments: [
        {
          name: "newUsers",
          definition: {
            entryNode: {
              type: SegmentNodeType.Trait,
              id: "1",
              path: "createdAt",
              operator: {
                type: SegmentOperatorType.Within,
                windowSeconds: 60,
              },
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            ({ now }) => ({
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                createdAt: new Date(now - 100).toISOString(),
              },
            }),
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user is initially within segment window",
          indexedStates: [
            ({ now }) => ({
              type: "segment",
              userId: "user-1",
              name: "newUsers",
              nodeId: "1",
              indexedValue: Math.floor((now - 100) / 1000),
            }),
          ],
          users: [
            {
              id: "user-1",
              segments: {
                newUsers: true,
              },
            },
          ],
          states: [
            ({ now }) => ({
              type: "segment",
              userId: "user-1",
              name: "newUsers",
              nodeId: "1",
              lastValue: new Date(now - 100).toISOString(),
            }),
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 50,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user continues to be within the segment window after waiting for a short period",
          users: [
            {
              id: "user-1",
              segments: {
                newUsers: true,
              },
            },
          ],
          states: [
            ({ now }) => ({
              type: "segment",
              userId: "user-1",
              name: "newUsers",
              nodeId: "1",
              lastValue: new Date(now - 50 - 100).toISOString(),
            }),
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1200000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user falls outside of segment window after waiting",
          users: [
            {
              id: "user-1",
              segments: {
                newUsers: null,
              },
            },
          ],
          states: [
            ({ now }) => ({
              type: "segment",
              userId: "user-1",
              name: "newUsers",
              nodeId: "1",
              lastValue: new Date(now - 100 - 50 - 1200000).toISOString(),
            }),
          ],
        },
      ],
    },
    {
      description: "computes absolute timestamp operator trait segment",
      userProperties: [],
      segments: [],
      steps: [
        {
          type: EventsStepType.UpdateComputedProperty,
          updater: (ctx) => {
            return {
              segments: [
                {
                  name: "newUsers",
                  definition: {
                    entryNode: {
                      type: SegmentNodeType.Trait,
                      id: "1",
                      path: "createdAt",
                      operator: {
                        type: SegmentOperatorType.AbsoluteTimestamp,
                        absoluteTimestamp: new Date(
                          // 5 hours from now
                          ctx.now + 1000 * 60 * 60 * 5,
                        ).toISOString(),
                        direction: CursorDirectionEnum.After,
                      },
                    },
                    nodes: [],
                  },
                },
              ],
            };
          },
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            ({ now }) => ({
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                createdAt: new Date(now - 100).toISOString(),
              },
            }),
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "first user is not in the segment",
          users: [
            {
              id: "user-1",
              segments: {
                newUsers: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          // 7 hours from now
          timeMs: 1000 * 60 * 60 * 7,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            ({ now }) => ({
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-2",
              traits: {
                createdAt: new Date(now - 100).toISOString(),
              },
            }),
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "next user is in the segment",
          users: [
            {
              id: "user-1",
              segments: {
                newUsers: null,
              },
            },
            {
              id: "user-2",
              segments: {
                newUsers: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "computes grouped within operator trait segment",
      userProperties: [],
      segments: [
        {
          name: "newUsers",
          definition: {
            entryNode: {
              type: SegmentNodeType.And,
              id: "1",
              children: ["2", "3"],
            },
            nodes: [
              {
                type: SegmentNodeType.Trait,
                id: "2",
                path: "createdAt",
                operator: {
                  type: SegmentOperatorType.Within,
                  windowSeconds: 60,
                },
              },
              {
                type: SegmentNodeType.Trait,
                id: "3",
                path: "path1",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "val1",
                },
              },
            ],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            ({ now }) => ({
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                path1: "val1",
                createdAt: new Date(now - 100).toISOString(),
              },
            }),
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user is initially within segment window",
          indexedStates: [
            ({ now }) => ({
              type: "segment",
              userId: "user-1",
              name: "newUsers",
              nodeId: "2",
              indexedValue: Math.floor((now - 100) / 1000),
            }),
          ],
          resolvedSegmentStates: [
            {
              userId: "user-1",
              name: "newUsers",
              nodeId: "2",
              segmentStateValue: true,
            },
            {
              userId: "user-1",
              name: "newUsers",
              nodeId: "3",
              segmentStateValue: true,
            },
          ],
          users: [
            {
              id: "user-1",
              segments: {
                newUsers: true,
              },
            },
          ],
          states: [
            ({ now }) => ({
              type: "segment",
              userId: "user-1",
              name: "newUsers",
              nodeId: "2",
              lastValue: new Date(now - 100).toISOString(),
            }),
            {
              type: "segment",
              userId: "user-1",
              name: "newUsers",
              nodeId: "3",
              lastValue: "val1",
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 50,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user continues to be within the segment window after waiting for a short period",
          users: [
            {
              id: "user-1",
              segments: {
                newUsers: true,
              },
            },
          ],
          states: [
            ({ now }) => ({
              type: "segment",
              userId: "user-1",
              name: "newUsers",
              nodeId: "2",
              lastValue: new Date(now - 50 - 100).toISOString(),
            }),
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1200000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user falls outside of segment window after waiting",
          users: [
            {
              id: "user-1",
              segments: {
                newUsers: null,
              },
            },
          ],
          states: [
            ({ now }) => ({
              type: "segment",
              userId: "user-1",
              name: "newUsers",
              nodeId: "2",
              lastValue: new Date(now - 100 - 50 - 1200000).toISOString(),
            }),
          ],
        },
      ],
    },
    {
      description: "computes HasBeen operator trait segment",
      userProperties: [],
      segments: [
        {
          name: "stuckOnboarding",
          definition: {
            entryNode: {
              type: SegmentNodeType.Trait,
              id: "1",
              path: "status",
              operator: {
                type: SegmentOperatorType.HasBeen,
                value: "onboarding",
                comparator: SegmentHasBeenOperatorComparator.GTE,
                windowSeconds: 60 * 60 * 24 * 7,
              },
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                status: "onboarding",
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 50,
        },

        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user is initially not stuck onboarding",
          users: [
            {
              id: "user-1",
              segments: {
                stuckOnboarding: null,
              },
            },
          ],
          states: [
            ({ now }) => ({
              userId: "user-1",
              type: "segment",
              nodeId: "1",
              name: "stuckOnboarding",
              lastValue: "onboarding",
              maxEventTime: new Date(
                floorToNearest(now - 100 - 50, 60480000),
              ).toISOString(),
            }),
          ],
        },
        {
          type: EventsStepType.Sleep,
          // 1 week + 1 minute
          timeMs: 1000 * 60 * 60 * 24 * 7 + 60 * 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "after remaining onboarding for over a week the user is stuck onboarding",
          states: [
            ({ now }) => ({
              userId: "user-1",
              type: "segment",
              nodeId: "1",
              name: "stuckOnboarding",
              lastValue: "onboarding",
              maxEventTime: new Date(
                floorToNearest(
                  now - (1000 * 60 * 60 * 24 * 7 + 60 * 1000) - 100 - 50,
                  60480000,
                ),
              ).toISOString(),
            }),
          ],
          users: [
            {
              id: "user-1",
              segments: {
                stuckOnboarding: true,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 500,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                status: "onboarding",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "continues to be stuck onboarding after submitting redundant identify events",
          states: [
            ({ now }) => ({
              userId: "user-1",
              type: "segment",
              nodeId: "1",
              name: "stuckOnboarding",
              lastValue: "onboarding",
              // last event shouldn't update maxEventTime because has same "onboarding" value
              maxEventTime: new Date(
                floorToNearest(
                  now - (1000 * 60 * 60 * 24 * 7 + 60 * 1000) - 50 - 500 - 100,
                  60480000,
                ),
              ).toISOString(),
            }),
          ],
          users: [
            {
              id: "user-1",
              segments: {
                stuckOnboarding: true,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 500,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                status: "active",
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000 * 60 * 60 * 24 * 7,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "is no longer stuck onboarding when status changes to active",
          states: [
            ({ now }) => ({
              userId: "user-1",
              type: "segment",
              nodeId: "1",
              name: "stuckOnboarding",
              lastValue: "active",
              maxEventTime: new Date(
                floorToNearest(now - 1000 * 60 * 60 * 24 * 7 - 100, 60480000),
              ).toISOString(),
            }),
          ],
          users: [
            {
              id: "user-1",
              segments: {
                stuckOnboarding: null,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "computes HasBeen operator trait segment with less than comparator",
      userProperties: [],
      segments: [
        {
          name: "recentlyStartedOnboarding",
          definition: {
            entryNode: {
              type: SegmentNodeType.Trait,
              id: "1",
              path: "status",
              operator: {
                type: SegmentOperatorType.HasBeen,
                value: "onboarding",
                comparator: SegmentHasBeenOperatorComparator.LT,
                windowSeconds: 60 * 60 * 24 * 7,
              },
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,

          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                status: "onboarding",
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 50,
        },

        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user initially is in recently started onboarding",
          users: [
            {
              id: "user-1",
              segments: {
                recentlyStartedOnboarding: true,
              },
            },
          ],
          resolvedSegmentStates: [
            {
              userId: "user-1",
              nodeId: "1",
              name: "recentlyStartedOnboarding",
              segmentStateValue: true,
            },
          ],
          states: [
            ({ now }) => ({
              userId: "user-1",
              type: "segment",
              nodeId: "1",
              name: "recentlyStartedOnboarding",
              lastValue: "onboarding",
              maxEventTime: new Date(
                floorToNearest(now - 100 - 50, 60480000),
              ).toISOString(),
            }),
          ],
        },
        {
          type: EventsStepType.Sleep,
          // 1 week + 1 minute
          timeMs: 1000 * 60 * 60 * 24 * 7 + 60 * 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "after remaining onboarding for over a week the user is no longer in recently started onboarding segment",
          indexedStates: [
            ({ now }) => ({
              userId: "user-1",
              type: "segment",
              nodeId: "1",
              name: "recentlyStartedOnboarding",
              indexedValue:
                floorToNearest(
                  now - (1000 * 60 * 60 * 24 * 7 + 60 * 1000) - 100 - 50,
                  60480000,
                ) / 1000,
            }),
          ],
          states: [
            ({ now }) => ({
              userId: "user-1",
              type: "segment",
              nodeId: "1",
              name: "recentlyStartedOnboarding",
              lastValue: "onboarding",
              maxEventTime: new Date(
                floorToNearest(
                  now - (1000 * 60 * 60 * 24 * 7 + 60 * 1000) - 100 - 50,
                  60480000,
                ),
              ).toISOString(),
            }),
          ],
          users: [
            {
              id: "user-1",
              segments: {
                recentlyStartedOnboarding: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 500,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                status: "onboarding",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "continues to not be in recently started onboarding segment after submitting redundant identify events",
          states: [
            ({ now }) => ({
              userId: "user-1",
              type: "segment",
              nodeId: "1",
              name: "recentlyStartedOnboarding",
              lastValue: "onboarding",
              // last event shouldn't update maxEventTime because has same "onboarding" value
              maxEventTime: new Date(
                floorToNearest(
                  now - (1000 * 60 * 60 * 24 * 7 + 60 * 1000) - 50 - 500 - 100,
                  60480000,
                ),
              ).toISOString(),
            }),
          ],
          users: [
            {
              id: "user-1",
              segments: {
                recentlyStartedOnboarding: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 500,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                status: "active",
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000 * 60 * 60 * 24 * 7,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "is still not in recently started onboarding segment after changing status",
          states: [
            ({ now }) => ({
              userId: "user-1",
              type: "segment",
              nodeId: "1",
              name: "recentlyStartedOnboarding",
              lastValue: "active",
              maxEventTime: new Date(
                floorToNearest(now - 1000 * 60 * 60 * 24 * 7 - 100, 60480000),
              ).toISOString(),
            }),
          ],
          users: [
            {
              id: "user-1",
              segments: {
                recentlyStartedOnboarding: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "any of user property",
      segments: [],
      userProperties: [
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Group,
            entry: "1",
            nodes: [
              {
                type: UserPropertyDefinitionType.AnyOf,
                id: "1",
                children: ["2", "3"],
              },
              {
                type: UserPropertyDefinitionType.Trait,
                id: "2",
                path: "email1",
              },
              {
                type: UserPropertyDefinitionType.Trait,
                id: "3",
                path: "email2",
              },
            ],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email1: "email1@test.com",
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-2",
              traits: {
                email2: "email2@test.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user-1 and user-2 both have emails",
          states: [
            {
              userId: "user-1",
              type: "user_property",
              name: "email",
              nodeId: "2",
              lastValue: "email1@test.com",
            },
            {
              userId: "user-2",
              type: "user_property",
              name: "email",
              nodeId: "3",
              lastValue: "email2@test.com",
            },
          ],
          users: [
            {
              id: "user-1",
              properties: {
                email: "email1@test.com",
              },
            },
            {
              id: "user-2",
              properties: {
                email: "email2@test.com",
              },
            },
          ],
        },
      ],
    },
    {
      description: "any of user property with null values",
      segments: [],
      userProperties: [
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Group,
            entry: "1",
            nodes: [
              {
                type: UserPropertyDefinitionType.AnyOf,
                id: "1",
                children: ["2", "3"],
              },
              {
                type: UserPropertyDefinitionType.Performed,
                id: "2",
                event: "*",
                path: "email",
              },
              {
                type: UserPropertyDefinitionType.Trait,
                id: "3",
                path: "email",
              },
            ],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -300,
              userId: "user-1",
              event: "test",
              properties: {
                email: null,
              },
            },
            {
              type: EventType.Track,
              offsetMs: -200,
              userId: "user-1",
              event: "test",
              properties: {
                email: "test@test.com",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test",
              properties: {
                email: null,
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -300,
              userId: "user-1",
              traits: {
                email: null,
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -200,
              userId: "user-1",
              traits: {
                email: "test@test.com",
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user-1 has email",
          states: [
            {
              userId: "user-1",
              type: "user_property",
              name: "email",
              nodeId: "2",
              lastValue: "test@test.com",
            },
            {
              userId: "user-1",
              type: "user_property",
              name: "email",
              nodeId: "3",
              lastValue: "test@test.com",
            },
          ],
          users: [
            {
              id: "user-1",
              properties: {
                email: "test@test.com",
              },
            },
          ],
        },
      ],
    },
    {
      description: "double nested segment with And and Or conditionals",
      segments: [
        {
          name: "doubleNested",
          definition: {
            entryNode: {
              type: SegmentNodeType.Or,
              id: "1",
              children: ["2", "3"],
            },
            nodes: [
              {
                type: SegmentNodeType.Trait,
                id: "2",
                path: "status",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "onboarding",
                },
              },
              {
                type: SegmentNodeType.And,
                id: "3",
                children: ["4", "5"],
              },
              {
                type: SegmentNodeType.Trait,
                id: "4",
                path: "status",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "active",
                },
              },
              {
                type: SegmentNodeType.Trait,
                id: "5",
                path: "atRisk",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "true",
                },
              },
            ],
          },
        },
      ],
      userProperties: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                status: "onboarding",
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-2",
              traits: {
                status: "active",
                atRisk: "true",
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-3",
              traits: {
                status: "active",
                atRisk: "false",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                doubleNested: true,
              },
            },
            {
              id: "user-2",
              segments: {
                doubleNested: true,
              },
            },
            {
              id: "user-3",
              segments: {
                doubleNested: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "performed segment",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.GreaterThanOrEqual,
              times: 2,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -150,
              userId: "user-1",
              event: "test",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email: "test1@email.com",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "test",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-2",
              traits: {
                email: "test2@email.com",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-3",
              event: "unrelated",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-3",
              traits: {
                email: "test3@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "includes user who performed test event twice, but excludes user who performed test event once, and user who performed unrelated event",
          states: [
            {
              type: "segment",
              userId: "user-1",
              name: "performed",
              nodeId: "1",
              uniqueCount: 2,
            },
            {
              type: "segment",
              userId: "user-2",
              name: "performed",
              nodeId: "1",
              uniqueCount: 1,
            },
          ],
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
            {
              id: "user-3",
              segments: {
                performed: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "performed segment with whitespace in event name",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test event name",
              timesOperator: RelationalOperators.GreaterThanOrEqual,
              times: 2,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -150,
              userId: "user-1",
              event: "test event name",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test event name",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email: "test1@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "includes user who performed test event twice, but excludes user who performed test event once, and user who performed unrelated event",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "performed segments with numeric operators",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.GreaterThanOrEqual,
              times: 1,
              properties: [
                {
                  path: "age",
                  operator: {
                    type: SegmentOperatorType.GreaterThanOrEqual,
                    value: 20,
                  },
                },
              ],
            },
            nodes: [],
          },
        },
        {
          name: "performed2",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.GreaterThanOrEqual,
              times: 1,
              properties: [
                {
                  path: "age",
                  operator: {
                    type: SegmentOperatorType.LessThan,
                    value: 20,
                  },
                },
              ],
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test",
              properties: {
                age: 18,
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "test",
              properties: {
                age: 22,
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "includes a user above the age threshold",
          users: [
            {
              id: "user-1",
              segments: {
                performed: null,
                performed2: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: true,
                performed2: null,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "when a performed segment conditions on an event being performed 0 times",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.Equals,
              times: 0,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "unrelated",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user who performed unrelated event is not in segment",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "the same users are in the segment on second compute",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "the same users are in the segment on third compute",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user who performed event once is in segment",
          users: [
            {
              id: "user-1",
              segments: {
                performed: null,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "when a performed segment conditions on an event being performed 0 times within a time window",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.Equals,
              withinSeconds: 5,
              times: 0,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "unrelated",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user who performed unrelated event within time window is in segment",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user is still in segment on recompute",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 10000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user with specified event is in segment after window has passed",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: true,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "when a performed segment conditions on an event being performed less than 2 times",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.LessThan,
              times: 2,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "unrelated",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "test",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-3",
              event: "test",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-3",
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 5000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "excludes user who performed event twice",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-3",
              segments: {
                performed: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "continues to show the same results after second compute properties",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-3",
              segments: {
                performed: null,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "when a performed segment checks less than 1 times in a time window",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.LessThan,
              times: 1,
              withinSeconds: 500,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "unrelated",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "excludes user who performed event once",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 100,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "continues to show the same results after second compute properties",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000 * 500,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "now includes user who performed event once once outside of time window",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "when a performed segment checks less than 2",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.LessThan,
              times: 2,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "unrelated",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "test",
            },
            {
              type: EventType.Track,
              offsetMs: -150,
              userId: "user-2",
              event: "test",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-3",
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "excludes user who performed event twice",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
            {
              id: "user-3",
              segments: {
                performed: true,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "when a performed segment checks less than 2 times in a time window",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.LessThan,
              times: 2,
              withinSeconds: 500,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "unrelated",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "test",
            },
            {
              type: EventType.Track,
              offsetMs: -150,
              userId: "user-2",
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "excludes user who performed event twice",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 100,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "continues to show the same results after second compute properties",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000 * 500,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "now includes user who performed event once once outside of time window",
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "performed segment with event prefix",
      userProperties: [
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "TEST_*",
              timesOperator: RelationalOperators.GreaterThanOrEqual,
              times: 2,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -150,
              userId: "user-1",
              event: "TEST_1",
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "TEST_2",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email: "test1@email.com",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "TEST_3",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-2",
              traits: {
                email: "test2@email.com",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-3",
              event: "unrelated",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-3",
              traits: {
                email: "test3@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "includes user who performed test event twice, but excludes user who performed test event once, and user who performed unrelated event",
          states: [
            {
              type: "segment",
              userId: "user-1",
              name: "performed",
              nodeId: "1",
              uniqueCount: 2,
            },
            {
              type: "segment",
              userId: "user-2",
              name: "performed",
              nodeId: "1",
              uniqueCount: 1,
            },
          ],
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
            {
              id: "user-3",
              segments: {
                performed: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "performed segment with properties",
      userProperties: [
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.GreaterThanOrEqual,
              times: 1,
              properties: [
                {
                  path: "status",
                  operator: {
                    type: SegmentOperatorType.Equals,
                    value: "active",
                  },
                },
              ],
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test",
              properties: {
                status: "active",
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email: "test1@email.com",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "test",
              properties: {
                status: "inactive",
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-2",
              traits: {
                email: "test2@email.com",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-3",
              event: "test",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-3",
              traits: {
                email: "test3@mail.com",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-4",
              event: "unrelated",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-4",
              traits: {
                email: "test4@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "only includes user with track event with appropriate property values",
          states: [
            {
              type: "segment",
              userId: "user-1",
              name: "performed",
              nodeId: "1",
              uniqueCount: 1,
            },
          ],
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: null,
              },
            },
            {
              id: "user-3",
              segments: {
                performed: null,
              },
            },
            {
              id: "user-4",
              segments: {
                performed: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "performed segment with properties and exists operator",
      userProperties: [
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.GreaterThanOrEqual,
              times: 1,
              properties: [
                {
                  path: "status",
                  operator: {
                    type: SegmentOperatorType.Exists,
                  },
                },
              ],
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test",
              properties: {
                status: "active",
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                email: "test1@email.com",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-2",
              event: "test",
              properties: {
                status: "inactive",
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-2",
              traits: {
                email: "test2@email.com",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-3",
              event: "test",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-3",
              traits: {
                email: "test3@mail.com",
              },
            },
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-4",
              event: "unrelated",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-4",
              traits: {
                email: "test4@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "only includes user with track event with appropriate property values",
          states: [
            {
              type: "segment",
              userId: "user-1",
              name: "performed",
              nodeId: "1",
              uniqueCount: 1,
            },
          ],
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                performed: true,
              },
            },
            {
              id: "user-3",
              segments: {
                performed: null,
              },
            },
            {
              id: "user-4",
              segments: {
                performed: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "trait segment with not exists operator",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      only: true,
      segments: [
        {
          name: "emailNotExists",
          definition: {
            entryNode: {
              type: SegmentNodeType.Trait,
              id: "1",
              path: "email",
              operator: {
                type: SegmentOperatorType.NotExists,
              },
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              userId: "user-1",
              offsetMs: -100,
              traits: {
                email: "test1@email.com",
              },
            },
            {
              type: EventType.Identify,
              userId: "user-2",
              offsetMs: -100,
              traits: {
                email: "",
              },
            },
            {
              type: EventType.Identify,
              userId: "user-3",
              offsetMs: -100,
              traits: {},
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "the not exists segments should be calculated correctly initially",
          users: [
            {
              id: "user-1",
              segments: {
                emailNotExists: null,
              },
            },
            {
              id: "user-2",
              segments: {
                emailNotExists: true,
              },
            },
            {
              id: "user-3",
              segments: {
                emailNotExists: true,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.UpdateComputedProperty,
          segments: [
            {
              name: "emailNotExists",
              definition: {
                entryNode: {
                  type: SegmentNodeType.Trait,
                  // Make a change that should not be impactful, other than updating the state ids
                  id: "2",
                  path: "email",
                  operator: {
                    type: SegmentOperatorType.NotExists,
                  },
                },
                nodes: [],
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "the not exists segments should be calculated correctly after making a no-op update to the segment definition and recomputing",
          users: [
            {
              id: "user-1",
              segments: {
                emailNotExists: null,
              },
            },
            {
              id: "user-2",
              segments: {
                emailNotExists: true,
              },
            },
            {
              id: "user-3",
              segments: {
                emailNotExists: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "performed segment with nested properties",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "performed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.GreaterThanOrEqual,
              times: 1,
              properties: [
                {
                  path: "level1.level2.level3",
                  operator: {
                    type: SegmentOperatorType.Equals,
                    value: "value1",
                  },
                },
              ],
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              offsetMs: -100,
              userId: "user-1",
              event: "test",
              properties: {
                level1: {
                  level2: {
                    level3: "value1",
                  },
                },
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "checks nested values",
          states: [
            {
              type: "segment",
              userId: "user-1",
              name: "performed",
              nodeId: "1",
              uniqueCount: 1,
            },
          ],
          users: [
            {
              id: "user-1",
              segments: {
                performed: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "last performed segment",
      userProperties: [],
      segments: [
        {
          name: "lastPerformed",
          definition: {
            entryNode: {
              type: SegmentNodeType.LastPerformed,
              id: "1",
              event: "test",
              whereProperties: [
                {
                  path: "kind",
                  operator: {
                    type: SegmentOperatorType.Equals,
                    value: "integration",
                  },
                },
              ],
              hasProperties: [
                {
                  path: "group",
                  operator: {
                    type: SegmentOperatorType.Equals,
                    value: "first",
                  },
                },
              ],
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              userId: "user-1",
              event: "test",
              offsetMs: -100,
              properties: {
                kind: "integration",
                group: "first",
              },
            },
            {
              type: EventType.Track,
              userId: "user-2",
              event: "unrelated",
              offsetMs: -100,
              properties: {
                kind: "integration",
                group: "first",
              },
            },
            {
              type: EventType.Track,
              userId: "user-3",
              event: "test",
              offsetMs: -100,
              properties: {
                kind: "unrelated",
                group: "first",
              },
            },
            {
              type: EventType.Track,
              userId: "user-4",
              event: "test",
              offsetMs: -100,
              properties: {
                kind: "integration",
                group: "unrelated",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                lastPerformed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                lastPerformed: null,
              },
            },
            {
              id: "user-3",
              segments: {
                lastPerformed: null,
              },
            },
            {
              id: "user-4",
              segments: {
                lastPerformed: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "last performed segment with exists operator",
      userProperties: [],
      segments: [
        {
          name: "lastPerformed",
          definition: {
            entryNode: {
              type: SegmentNodeType.LastPerformed,
              id: "1",
              event: "test",
              whereProperties: [
                {
                  path: "kind",
                  operator: {
                    type: SegmentOperatorType.Exists,
                  },
                },
              ],
              hasProperties: [
                {
                  path: "group",
                  operator: {
                    type: SegmentOperatorType.Exists,
                  },
                },
              ],
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              userId: "user-1",
              event: "test",
              offsetMs: -100,
              properties: {
                kind: "integration",
                group: "first",
              },
            },
            {
              type: EventType.Track,
              userId: "user-2",
              event: "unrelated",
              offsetMs: -100,
              properties: {
                kind: "integration",
              },
            },
            {
              type: EventType.Track,
              userId: "user-3",
              event: "test",
              offsetMs: -100,
              properties: {
                group: "first",
              },
            },
            {
              type: EventType.Track,
              userId: "user-4",
              event: "test",
              offsetMs: -100,
              properties: {},
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                lastPerformed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                lastPerformed: null,
              },
            },
            {
              id: "user-3",
              segments: {
                lastPerformed: null,
              },
            },
            {
              id: "user-4",
              segments: {
                lastPerformed: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "last performed segment with not exists operator",
      userProperties: [],
      segments: [
        {
          name: "lastPerformed",
          definition: {
            entryNode: {
              type: SegmentNodeType.LastPerformed,
              id: "1",
              event: "test",
              whereProperties: [
                {
                  path: "kind",
                  operator: {
                    type: SegmentOperatorType.NotExists,
                  },
                },
              ],
              hasProperties: [
                {
                  path: "group",
                  operator: {
                    type: SegmentOperatorType.NotExists,
                  },
                },
              ],
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              userId: "user-1",
              event: "test",
              offsetMs: -100,
              properties: {
                kind: "integration",
                group: "first",
              },
            },
            {
              type: EventType.Track,
              userId: "user-2",
              event: "unrelated",
              offsetMs: -100,
              properties: {
                kind: "integration",
              },
            },
            {
              type: EventType.Track,
              userId: "user-3",
              event: "test",
              offsetMs: -100,
              properties: {
                group: "first",
              },
            },
            {
              type: EventType.Track,
              userId: "user-4",
              event: "test",
              offsetMs: -100,
              properties: {},
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                lastPerformed: null,
              },
            },
            {
              id: "user-2",
              segments: {
                lastPerformed: null,
              },
            },
            {
              id: "user-3",
              segments: {
                lastPerformed: null,
              },
            },
            {
              id: "user-4",
              segments: {
                lastPerformed: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "last performed segment with prefix event",
      userProperties: [],
      segments: [
        {
          name: "lastPerformed",
          definition: {
            entryNode: {
              type: SegmentNodeType.LastPerformed,
              id: "1",
              event: "eventNamespace.*",
              whereProperties: [
                {
                  path: "kind",
                  operator: {
                    type: SegmentOperatorType.Exists,
                  },
                },
              ],
              hasProperties: [
                {
                  path: "group",
                  operator: {
                    type: SegmentOperatorType.Exists,
                  },
                },
              ],
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              userId: "user-1",
              event: "eventNamespace.test1",
              offsetMs: -100,
              properties: {
                kind: "integration",
                group: "first",
              },
            },
            {
              type: EventType.Track,
              userId: "user-2",
              event: "eventNamespace.test2",
              offsetMs: -100,
              properties: {
                kind: "integration",
                group: "first",
              },
            },
            {
              type: EventType.Track,
              userId: "user-3",
              event: "otherNamespace.test3",
              offsetMs: -100,
              properties: {
                kind: "integration",
                group: "first",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                lastPerformed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                lastPerformed: true,
              },
            },
            {
              id: "user-3",
              segments: {
                lastPerformed: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "last performed segment with less than operator",
      userProperties: [],
      segments: [
        {
          name: "lastPerformed",
          definition: {
            entryNode: {
              type: SegmentNodeType.LastPerformed,
              id: "1",
              event: "test",
              whereProperties: [
                {
                  path: "kind",
                  operator: {
                    type: SegmentOperatorType.Exists,
                  },
                },
              ],
              hasProperties: [
                {
                  path: "count",
                  operator: {
                    type: SegmentOperatorType.LessThan,
                    value: 10,
                  },
                },
              ],
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              userId: "user-1",
              event: "test",
              offsetMs: -100,
              properties: {
                kind: "integration",
                count: 9,
              },
            },
            {
              type: EventType.Track,
              userId: "user-2",
              event: "test",
              offsetMs: -100,
              properties: {
                kind: "integration",
              },
            },
            {
              type: EventType.Track,
              userId: "user-3",
              event: "test",
              offsetMs: -100,
              properties: {
                kind: "integration",
                count: 11,
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                lastPerformed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                lastPerformed: null,
              },
            },
            {
              id: "user-3",
              segments: {
                lastPerformed: null,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "last performed segment with equals numeric value where property",
      userProperties: [],
      segments: [
        {
          name: "lastPerformed",
          definition: {
            entryNode: {
              type: SegmentNodeType.LastPerformed,
              id: "1",
              event: "test",
              hasProperties: [
                {
                  path: "count",
                  operator: {
                    type: SegmentOperatorType.Equals,
                    value: "10",
                  },
                },
              ],
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              userId: "user-1",
              event: "test",
              offsetMs: -100,
              properties: {
                kind: "integration",
                count: 10,
              },
            },
            {
              type: EventType.Track,
              userId: "user-2",
              event: "test",
              offsetMs: -100,
              properties: {
                kind: "integration",
              },
            },
            {
              type: EventType.Track,
              userId: "user-3",
              event: "test",
              offsetMs: -100,
              properties: {
                kind: "integration",
                count: 11,
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                lastPerformed: true,
              },
            },
            {
              id: "user-2",
              segments: {
                lastPerformed: null,
              },
            },
            {
              id: "user-3",
              segments: {
                lastPerformed: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "manual segment",
      userProperties: [],
      segments: [
        {
          name: "manual",
          definition: {
            entryNode: {
              type: SegmentNodeType.Manual,
              id: "1",
              version: 1,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              userId: "user-1",
              offsetMs: -100,
              traits: {
                email: "max@test.com",
              },
            },
            // manually added user
            ({ segments }) => ({
              type: EventType.Track,
              userId: "user-1",
              event: InternalEventType.ManualSegmentUpdate,
              offsetMs: -100,
              properties: {
                segmentId: segments[0]?.id,
                version: 1,
                inSegment: 1,
              },
            }),
            {
              type: EventType.Identify,
              userId: "user-2",
              offsetMs: -100,
              traits: {
                email: "chandler@test.com",
              },
            },
            // manually removed user
            ({ segments }) => ({
              type: EventType.Track,
              userId: "user-3",
              event: InternalEventType.ManualSegmentUpdate,
              offsetMs: -100,
              properties: {
                segmentId: segments[0]?.id,
                version: 1,
                inSegment: 0,
              },
            }),
            // never added user
            {
              type: EventType.Identify,
              userId: "user-3",
              offsetMs: -100,
              traits: {
                email: "john@test.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          states: [
            {
              userId: "user-1",
              type: "segment",
              name: "manual",
              nodeId: "1",
              lastValue: JSON.stringify(["1"]),
            },
          ],
          users: [
            {
              id: "user-1",
              segments: {
                manual: true,
              },
            },
            {
              id: "user-2",
              segments: {
                manual: null,
              },
            },
            {
              id: "user-3",
              segments: {
                manual: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.UpdateComputedProperty,
          segments: [
            {
              name: "manual",
              definition: {
                entryNode: {
                  type: SegmentNodeType.Manual,
                  id: "1",
                  version: 2,
                },
                nodes: [],
              },
            },
          ],
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            ({ segments }) => ({
              type: EventType.Track,
              userId: "user-2",
              event: InternalEventType.ManualSegmentUpdate,
              offsetMs: -100,
              properties: {
                segmentId: segments[0]?.id,
                version: 2,
                inSegment: 1,
              },
            }),
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          // allow async delete to propagate
          type: EventsStepType.Delay,
          timeMs: 5000,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                manual: null,
              },
            },
            {
              id: "user-2",
              segments: {
                manual: true,
              },
            },
            {
              id: "user-3",
              segments: {
                manual: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "last performed segment with nested properties",
      userProperties: [],
      segments: [
        {
          name: "lastPerformed",
          definition: {
            entryNode: {
              type: SegmentNodeType.LastPerformed,
              id: "1",
              event: "test",
              whereProperties: [
                {
                  path: "a.b",
                  operator: {
                    type: SegmentOperatorType.Equals,
                    value: "c",
                  },
                },
              ],
              hasProperties: [
                {
                  path: "x.y",
                  operator: {
                    type: SegmentOperatorType.Equals,
                    value: "z",
                  },
                },
              ],
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              userId: "user-1",
              event: "test",
              offsetMs: -100,
              properties: {
                a: {
                  b: "c",
                },
                x: {
                  y: "z",
                },
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                lastPerformed: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "with a performed many user property",
      userProperties: [
        {
          name: "performedMany",
          definition: {
            type: UserPropertyDefinitionType.PerformedMany,
            or: [
              {
                event: "test1",
              },
              {
                event: "test2",
              },
            ],
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Track,
              userId: "user-1",
              event: "test1",
              offsetMs: -(1000 * 60),
              properties: {
                prop1: "value1",
              },
            },
            {
              type: EventType.Track,
              userId: "user-1",
              event: "test2",
              offsetMs: -100,
              properties: {
                prop2: "value2",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          states: [
            {
              userId: "user-1",
              type: "user_property",
              name: "performedMany",
            },
          ],
          users: [
            ({ now }) => ({
              id: "user-1",
              properties: {
                performedMany: [
                  {
                    event: "test2",
                    timestamp: format(
                      utcToZonedTime(new Date(now - 100), "UTC"),
                      "yyyy-MM-dd'T'HH:mm:ss",
                    ),
                    properties: {
                      prop2: "value2",
                    },
                  },
                  {
                    event: "test1",
                    timestamp: format(
                      utcToZonedTime(new Date(now - 1000 * 60), "UTC"),
                      "yyyy-MM-dd'T'HH:mm:ss",
                    ),
                    properties: {
                      prop1: "value1",
                    },
                  },
                ] as ParsedPerformedManyValueItem[],
              },
            }),
          ],
        },
      ],
    },
    {
      description: "with a performed user property",
      userProperties: [
        {
          name: "performed",
          definition: {
            type: UserPropertyDefinitionType.Performed,
            event: "register",
            path: "status",
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "register",
              properties: {
                status: "lead",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                performed: "lead",
              },
            },
          ],
        },
      ],
    },
    {
      description: "with a performed user property with skipReCompute",
      userProperties: [
        {
          name: "performed",
          definition: {
            type: UserPropertyDefinitionType.Performed,
            event: "register",
            path: "status",
            skipReCompute: true,
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "register",
              properties: {
                status: "lead",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "skipReCompute prevents user property from being computed from events",
          users: [
            {
              id: "user-1",
              properties: {},
            },
          ],
        },
      ],
    },
    {
      description: "with a performed user property with a prefix match",
      userProperties: [
        {
          name: "performed",
          definition: {
            type: UserPropertyDefinitionType.Performed,
            event: "PURCHASE_*",
            path: "name",
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "PURCHASE_ENTERPRISE",
              properties: {
                name: "My Enterprise Package",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                performed: "My Enterprise Package",
              },
            },
          ],
        },
      ],
    },
    {
      description: "with a file user property",
      userProperties: [
        {
          name: "file",
          definition: {
            type: UserPropertyDefinitionType.File,
            name: "receipt.pdf",
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "order_confirmation",
              properties: {
                [InternalEventType.AttachedFiles]: {
                  "receipt.pdf": {
                    mimeType: "application/pdf",
                    type: AppFileType.BlobStorage,
                    key: "my/blob/storage/key.pdf",
                  } satisfies Omit<BlobStorageFile, "name">,
                },
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                file: {
                  key: "my/blob/storage/key.pdf",
                  mimeType: "application/pdf",
                  name: "receipt.pdf",
                  type: AppFileType.BlobStorage,
                },
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "with a performed user property that has additional property conditions",
      userProperties: [
        {
          name: "performed",
          definition: {
            type: UserPropertyDefinitionType.Performed,
            event: InternalEventType.MessageSent,
            path: "variant.response.body.status",
            properties: [
              {
                path: "templateId",
                operator: {
                  type: UserPropertyOperatorType.Equals,
                  value: "my-template-id",
                },
              },
            ],
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -400,
              type: EventType.Track,
              event: "wrong-event",
              properties: {
                templateId: "my-template-id",
                variant: {
                  response: {
                    body: {
                      status: "status1",
                    },
                  },
                },
              },
            },
            {
              userId: "user-1",
              offsetMs: -500,
              type: EventType.Track,
              event: InternalEventType.MessageSent,
              properties: {
                templateId: "wrong-template-id",
                variant: {
                  response: {
                    body: {
                      status: "status2",
                    },
                  },
                },
              },
            },
            {
              userId: "user-1",
              offsetMs: -600,
              type: EventType.Track,
              event: InternalEventType.MessageSent,
              properties: {
                templateId: "my-template-id",
                variant: {
                  response: {
                    body: {
                      status: "status3",
                    },
                  },
                },
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "picks the last event that satisfies the conditions",
          users: [
            {
              id: "user-1",
              properties: {
                performed: "status3",
              },
            },
          ],
        },
      ],
    },
    {
      description: "with an opt out subscription group segment",
      segments: [
        {
          name: "optOut",
          definition: {
            entryNode: {
              type: SegmentNodeType.SubscriptionGroup,
              id: "1",
              subscriptionGroupId: "subscription-group-id",
              subscriptionGroupType: SubscriptionGroupType.OptOut,
            },
            nodes: [],
          },
        },
      ],
      userProperties: [
        {
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Identify,
              traits: {
                email: "test@email.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user is initially not opted out by default",
          users: [
            {
              id: "user-1",
              segments: {
                optOut: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              offsetMs: -100,
              userId: "user-1",
              type: EventType.Track,
              event: InternalEventType.SubscriptionChange,
              properties: {
                subscriptionId: "subscription-group-id",
                action: SubscriptionChange.Unsubscribe,
              },
            } satisfies TestEvent & SubscriptionChangeEvent,
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user is opted out after unsubscribing",
          users: [
            {
              id: "user-1",
              segments: {
                optOut: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              offsetMs: -100,
              userId: "user-1",
              type: EventType.Track,
              event: InternalEventType.SubscriptionChange,
              properties: {
                subscriptionId: "subscription-group-id",
                action: SubscriptionChange.Subscribe,
              },
            } satisfies TestEvent & SubscriptionChangeEvent,
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "user is opted in after re subscribing",
          users: [
            {
              id: "user-1",
              segments: {
                optOut: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "when segmenting on email opens",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "emailOpened",
          definition: {
            entryNode: {
              type: SegmentNodeType.Email,
              event: InternalEventType.EmailOpened,
              times: 1,
              templateId: "my-template-id",
              id: "1",
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            ({ workspace }) => ({
              offsetMs: -100,
              userId: "user-1",
              type: EventType.Track,
              event: InternalEventType.EmailOpened,
              properties: {
                email: "test@email.com",
                journeyId: "my-journey-id",
                runId: "my-run-id",
                messageId: "my-original-message-id",
                userId: "user-1",
                workspaceId: workspace.id,
                templateId: "my-template-id",
                nodeId: "my-message-node-id",
              },
            }),
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                emailOpened: true,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "with a performed user property with a complex inner structure",
      userProperties: [
        {
          name: "complex",
          definition: {
            type: UserPropertyDefinitionType.Performed,
            event: "test",
            path: "obj1",
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "test",
              properties: {
                obj1: {
                  prop1: "value1",
                  obj2: {
                    prop2: "value2",
                    prop3: ["value3", "value4"],
                  },
                },
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                complex: {
                  prop1: "value1",
                  obj2: {
                    prop2: "value2",
                    prop3: ["value3", "value4"],
                  },
                },
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "with a performed user property with a flat complex inner structure",
      userProperties: [
        {
          name: "complex",
          definition: {
            type: UserPropertyDefinitionType.Performed,
            event: "test",
            path: "$",
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "test",
              properties: {
                prop1: "value1",
                obj2: {
                  prop2: "value2",
                  prop3: ["value3", "value4"],
                },
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                complex: {
                  prop1: "value1",
                  obj2: {
                    prop2: "value2",
                    prop3: ["value3", "value4"],
                  },
                },
              },
            },
          ],
        },
      ],
    },
    {
      description: "with a trait user property with a complex inner structure",
      userProperties: [
        {
          name: "complex",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "obj1",
          },
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Identify,
              traits: {
                obj1: {
                  prop1: "value1",
                  obj2: {
                    prop2: "value2",
                    prop3: ["value3", "value4"],
                  },
                },
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                complex: {
                  prop1: "value1",
                  obj2: {
                    prop2: "value2",
                    prop3: ["value3", "value4"],
                  },
                },
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "when a performed segment is updated with a new performed count threshold",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "updatedPerformed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.GreaterThanOrEqual,
              times: 1,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                updatedPerformed: true,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.UpdateComputedProperty,
          segments: [
            {
              name: "updatedPerformed",
              definition: {
                entryNode: {
                  type: SegmentNodeType.Performed,
                  id: "1",
                  event: "test",
                  timesOperator: RelationalOperators.GreaterThanOrEqual,
                  // updating times threshold to 2
                  times: 2,
                },
                nodes: [],
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          // allow async delete to propagate
          type: EventsStepType.Delay,
          timeMs: 5000,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user is no longer in the segment after its definition is updated",
          users: [
            {
              id: "user-1",
              segments: {
                updatedPerformed: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "after receiving another event user satisfies new segment definition",
          users: [
            {
              id: "user-1",
              segments: {
                updatedPerformed: true,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "when a performed user property is updated with a new skipReCompute",
      userProperties: [
        {
          name: "skipReCompute",
          definition: {
            type: UserPropertyDefinitionType.Performed,
            event: "test",
            path: "key1",
          } satisfies PerformedUserPropertyDefinition,
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "test",
              properties: {
                key1: "value1",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                skipReCompute: "value1",
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.UpdateComputedProperty,
          userProperties: [
            {
              name: "skipReCompute",
              definition: {
                type: UserPropertyDefinitionType.Performed,
                event: "test",
                path: "key1",
                skipReCompute: true,
              } satisfies PerformedUserPropertyDefinition,
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          // allow async delete to propagate
          type: EventsStepType.Delay,
          timeMs: 5000,
        },
        {
          type: EventsStepType.Assert,
          description: "user property is empty after its definition is updated",
          users: [
            {
              id: "user-1",
              properties: {},
            },
          ],
        },
      ],
    },
    {
      description: "when a performed user property is updated with a new path",
      userProperties: [
        {
          name: "updatedPath",
          definition: {
            type: UserPropertyDefinitionType.Performed,
            event: "test",
            path: "key1",
          } satisfies PerformedUserPropertyDefinition,
        },
      ],
      segments: [],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "test",
              properties: {
                key1: "value1",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              properties: {
                updatedPath: "value1",
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.UpdateComputedProperty,
          userProperties: [
            {
              name: "updatedPath",
              definition: {
                type: UserPropertyDefinitionType.Performed,
                event: "test",
                path: "key2",
              } satisfies PerformedUserPropertyDefinition,
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          // allow async delete to propagate
          type: EventsStepType.Delay,
          timeMs: 5000,
        },
        {
          type: EventsStepType.Assert,
          description: "user property is empty after its definition is updated",
          users: [
            {
              id: "user-1",
              properties: {},
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "test",
              properties: {
                key2: "value2",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "after receiving another event user property is updated with new path value",
          users: [
            {
              id: "user-1",
              properties: {
                updatedPath: "value2",
              },
            },
          ],
        },
      ],
    },
    {
      description: "when a performed segment has a within condition",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "recentlyPerformed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.GreaterThanOrEqual,
              times: 1,
              withinSeconds: 5,
            },
            nodes: [],
          },
        },
      ],
      journeys: [
        {
          name: "test",
          entrySegmentName: "recentlyPerformed",
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -6000,
              type: EventType.Track,
              event: "test",
            },
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Identify,
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "when the tracked event occurred outside of the required window, does not set segment",
          users: [
            {
              id: "user-1",
              segments: {
                recentlyPerformed: null,
              },
            },
          ],
          journeys: [
            {
              journeyName: "test",
              times: 0,
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "when the tracked event then later occurs within the required window, user is in segment",
          users: [
            {
              id: "user-1",
              segments: {
                recentlyPerformed: true,
              },
            },
          ],
          journeys: [
            {
              journeyName: "test",
              times: 1,
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 6000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "then after waiting long enough without receiving the event again the user exits the segment",
          users: [
            {
              id: "user-1",
              segments: {
                recentlyPerformed: null,
              },
            },
          ],
          journeys: [
            {
              journeyName: "test",
              times: 1,
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "then after resubmitting the event the user enters the segment a second time",
          states: [
            {
              userId: "user-1",
              type: "segment",
              nodeId: "1",
              uniqueCount: 3,
              name: "recentlyPerformed",
            },
          ],
          users: [
            {
              id: "user-1",
              segments: {
                recentlyPerformed: true,
              },
            },
          ],
          journeys: [
            {
              journeyName: "test",
              times: 2,
            },
          ],
        },
      ],
    },
    {
      description:
        "when a performed segment is updated with a within condition",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "updatedPerformed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              timesOperator: RelationalOperators.GreaterThanOrEqual,
              times: 1,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                updatedPerformed: true,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 50000,
        },
        {
          type: EventsStepType.UpdateComputedProperty,
          segments: [
            {
              name: "updatedPerformed",
              definition: {
                entryNode: {
                  type: SegmentNodeType.Performed,
                  id: "1",
                  event: "test",
                  timesOperator: RelationalOperators.GreaterThanOrEqual,
                  times: 1,
                  // new within condition
                  withinSeconds: 5,
                },
                nodes: [],
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          // allow async deletes to propagate
          type: EventsStepType.Delay,
          timeMs: 5000,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user is no longer in the segment after its definition is updated",
          states: [
            {
              userId: "user-1",
              type: "segment",
              nodeId: "1",
              uniqueCount: 0,
              name: "updatedPerformed",
            },
          ],
          users: [
            {
              id: "user-1",
              segments: {
                updatedPerformed: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              userId: "user-1",
              offsetMs: -100,
              type: EventType.Track,
              event: "test",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "after receiving an event within the time window, user satisfies new segment definition",
          users: [
            {
              id: "user-1",
              segments: {
                updatedPerformed: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "computes an includes segment",
      segments: [
        {
          name: "includes",
          definition: {
            entryNode: {
              type: SegmentNodeType.Includes,
              id: "1",
              item: "test2",
              path: "items1",
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                items1: ["test1", "test2", "test3"],
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-2",
              traits: {
                items1: ["test4", "test5", "test6"],
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-3",
              traits: {
                items2: ["test1", "test2", "test3"],
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-4",
              traits: {
                items1: "invalid",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                includes: true,
              },
            },
            {
              id: "user-2",
              segments: {
                includes: null,
              },
            },
            {
              id: "user-3",
              segments: {
                includes: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                items1: [],
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user is no longer in the segment after its array is updated",
          users: [
            {
              id: "user-1",
              segments: {
                includes: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "computes a negative trait segment",
      userProperties: [],
      segments: [
        {
          name: "test",
          definition: {
            entryNode: {
              type: SegmentNodeType.Trait,
              id: "node-1",
              path: "env",
              operator: {
                type: SegmentOperatorType.NotEquals,
                value: "prod",
              },
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "test",
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-2",
              traits: {
                env: "prod",
              },
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-3",
              traits: {},
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          states: [
            {
              userId: "user-1",
              type: "segment",
              nodeId: "node-1",
              lastValue: "test",
              name: "test",
            },
            {
              userId: "user-2",
              type: "segment",
              nodeId: "node-1",
              lastValue: "prod",
              name: "test",
            },
            {
              userId: "user-3",
              type: "segment",
              nodeId: "node-1",
              lastValue: "",
              name: "test",
            },
          ],
          users: [
            {
              id: "user-1",
              segments: {
                test: true,
              },
            },
            {
              id: "user-2",
              segments: {
                test: null,
              },
            },
            {
              id: "user-3",
              segments: {
                test: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "computes an exists trait segment",
      userProperties: [],
      segments: [
        {
          name: "test",
          definition: {
            entryNode: {
              type: SegmentNodeType.Trait,
              id: randomUUID(),
              path: "env",
              operator: {
                type: SegmentOperatorType.Exists,
              },
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                env: "test",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                test: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "computes a trait segment with spaces in the path",
      userProperties: [],
      segments: [
        {
          name: "test",
          definition: {
            entryNode: {
              type: SegmentNodeType.Trait,
              id: randomUUID(),
              path: '$["value with spaces"]',
              operator: {
                type: SegmentOperatorType.Equals,
                value: "test",
              },
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                "value with spaces": "test",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                test: true,
              },
            },
          ],
        },
      ],
    },
    {
      description: "with a random bucket segment",
      userProperties: [
        {
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
          name: "id",
        },
      ],
      segments: [
        {
          name: "test",
          definition: {
            entryNode: {
              type: SegmentNodeType.RandomBucket,
              id: "1",
              percent: 0.5,
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
            },
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-b",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                test: null,
              },
            },
            {
              id: "user-b",
              segments: {
                test: true,
              },
            },
          ],
        },
      ],
    },
    {
      description:
        "when the performed segment property condition has a syntax error, it ignores that property",
      userProperties: [
        {
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
          name: "id",
        },
      ],
      segments: [
        {
          name: "withMalformed",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "test",
              properties: [
                {
                  path: "!*(_.$%",
                  operator: {
                    type: SegmentOperatorType.Equals,
                    value: "test",
                  },
                },
              ],
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          users: [
            {
              id: "user-1",
              segments: {
                withMalformed: null,
              },
            },
          ],
        },
      ],
    },
    {
      description: "anonymous users can and opt in subscription group",
      userProperties: [
        {
          definition: {
            type: UserPropertyDefinitionType.AnonymousId,
          },
          name: "anonymousId",
        },
      ],
      segments: [
        {
          name: "optIn",
          definition: {
            entryNode: {
              type: SegmentNodeType.SubscriptionGroup,
              id: "1",
              subscriptionGroupId: "subscription-group-id",
              subscriptionGroupType: SubscriptionGroupType.OptIn,
            },
            nodes: [],
          },
        },
      ],
      journeys: [
        {
          name: "optInAnonymous",
          entrySegmentName: "optIn",
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              anonymousId: "user-1",
              traits: {
                email: "test@test.com",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "before opting in, user is not in the segment",
          users: [
            {
              id: "user-1",
              segments: {
                optIn: null,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              offsetMs: -100,
              anonymousId: "user-1",
              type: EventType.Track,
              event: InternalEventType.SubscriptionChange,
              properties: {
                subscriptionId: "subscription-group-id",
                action: SubscriptionChange.Subscribe,
              },
            } satisfies TestEvent & SubscriptionChangeEvent,
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description: "after opting in, user is in the segment",
          users: [
            {
              id: "user-1",
              segments: {
                optIn: true,
              },
            },
          ],
          journeys: [
            {
              journeyName: "optInAnonymous",
              times: 1,
            },
          ],
        },
      ],
    },
    {
      description: "retroactively signals a segment entry journey",
      userProperties: [
        {
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
      ],
      segments: [
        {
          name: "isMax",
          definition: {
            entryNode: {
              type: SegmentNodeType.Trait,
              id: "1",
              path: "firstName",
              operator: {
                type: SegmentOperatorType.Equals,
                value: "Max",
              },
            },
            nodes: [],
          },
        },
      ],
      steps: [
        {
          type: EventsStepType.SubmitEvents,
          events: [
            {
              type: EventType.Identify,
              offsetMs: -100,
              userId: "user-1",
              traits: {
                firstName: "Max",
              },
            },
          ],
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "user is in the segment prior to the journey being created",
          users: [
            {
              id: "user-1",
              segments: {
                isMax: true,
              },
            },
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.UpdateJourney,
          journeys: [
            (ctx) => ({
              name: "isMaxJourney",
              definition: {
                entryNode: {
                  type: JourneyNodeType.SegmentEntryNode,
                  segment: ctx.segments.find((s) => s.name === "isMax")!.id,
                  child: JourneyNodeType.ExitNode,
                },
                nodes: [],
                exitNode: {
                  type: JourneyNodeType.ExitNode,
                },
              },
            }),
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 3 * 24 * 60 * 60 * 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          description:
            "journey signals for segment which has undergone several compute property periods before journey was created",
          journeys: [
            {
              journeyName: "isMaxJourney",
              times: 1,
            },
          ],
        },
        {
          type: EventsStepType.UpdateJourney,
          journeys: [
            (ctx) => ({
              name: "otherIsMaxJourney",
              definition: {
                entryNode: {
                  type: JourneyNodeType.SegmentEntryNode,
                  segment: ctx.segments.find((s) => s.name === "isMax")!.id,
                  child: JourneyNodeType.ExitNode,
                },
                nodes: [],
                exitNode: {
                  type: JourneyNodeType.ExitNode,
                },
              },
            }),
          ],
        },
        {
          type: EventsStepType.Sleep,
          timeMs: 3 * 24 * 60 * 60 * 1000,
        },
        {
          type: EventsStepType.ComputeProperties,
        },
        {
          type: EventsStepType.Assert,
          journeys: [
            {
              journeyName: "isMaxJourney",
              times: 1,
            },
            {
              journeyName: "otherIsMaxJourney",
              times: 1,
            },
          ],
        },
      ],
    },
  ];
  const only: null | string =
    tests.find((t) => t.only === true)?.description ?? null;

  test.concurrent.each(
    tests.filter(
      (t) => t.skip !== true && (only === null || only === t.description),
    ),
  )("$description", async (test) => {
    if (only && test.description !== only) {
      return;
    }

    let now = Date.now();

    const clickhouseCounters: ClickhouseCounters = {
      commands: 0,
      queries: 0,
      commandCalls: [],
      queryCalls: [],
    };

    const [workspace] = await db()
      .insert(schema.workspace)
      .values({
        id: randomUUID(),
        name: randomUUID(),
        updatedAt: new Date(now),
        createdAt: new Date(now),
      })
      .returning();
    if (!workspace) {
      throw new Error("could not create workspace");
    }

    const workspaceId = workspace.id;

    let { userProperties, segments } = await upsertComputedProperties({
      workspaceId,
      userProperties: test.userProperties ?? [],
      segments: test.segments ?? [],
      now,
    });

    let journeys: SavedHasStartedJourneyResource[] = await Promise.all(
      test.journeys?.map(async ({ name, entrySegmentName }) => {
        const segment = segments.find((s) => s.name === entrySegmentName);
        if (!segment) {
          throw new Error(
            `could not find segment with name: ${entrySegmentName}`,
          );
        }
        const definition: JourneyDefinition = {
          entryNode: {
            type: JourneyNodeType.SegmentEntryNode,
            segment: segment.id,
            child: JourneyNodeType.ExitNode,
          },
          nodes: [],
          exitNode: {
            type: JourneyNodeType.ExitNode,
          },
        };
        const journeyModel = await insert({
          table: schema.journey,
          values: {
            id: randomUUID(),
            workspaceId,
            name,
            definition,
            status: "Running",
            updatedAt: new Date(now),
            createdAt: new Date(now),
          },
        }).then(unwrap);
        const resource = unwrap(toJourneyResource(journeyModel));
        if (resource.status === "NotStarted") {
          throw new Error("journey should have been started");
        }
        return resource;
      }) ?? [],
    );

    for (const step of test.steps) {
      const stepContext: StepContext = {
        workspace,
        segments,
        now,
        clickhouseCounters,
      };
      switch (step.type) {
        case EventsStepType.SubmitEvents: {
          const events: TestEvent[] = [];
          for (const event of step.events) {
            if (typeof event === "function") {
              events.push(event(stepContext));
            } else {
              events.push(event);
            }
          }
          logger().debug(
            {
              events,
            },
            "submitEvents step",
          );
          await submitBatch({
            workspaceId,
            data: events,
            now,
          });
          break;
        }
        case EventsStepType.SubmitEventsTimes: {
          const batchSize = 1000;
          let events: TestEvent[] = [];

          for (let i = 0; i < step.times; i++) {
            for (const event of step.events) {
              events.push(event(stepContext, i));
            }

            if (events.length >= batchSize || i === step.times - 1) {
              logger().debug(
                {
                  batchSize,
                  batch: i,
                },
                "test:SubmitEventsTimes",
              );
              await submitBatch({
                workspaceId,
                data: events,
                now,
              });
              events = [];
            }
          }
          break;
        }
        case EventsStepType.Debug: {
          const debugQueries = step.queries?.map(async (q) => {
            const qb = new ClickHouseQueryBuilder();
            const { query, name } = q(stepContext, qb);
            const result = await clickhouseClient().query({
              query,
              query_params: qb.getQueries(),
            });
            const { data } = await result.json();
            const values = {
              name,
              query,
              data,
            };
            return values;
          });
          const [
            assignments,
            states,
            resolvedSegmentStates,
            periods,
            updatedComputedPropertyState,
            debugQueryData,
          ] = await Promise.all([
            readAssignments({ workspaceId }),
            readDisaggregatedStates({ workspaceId }),
            readResolvedSegmentStates({
              workspaceId,
            }),
            readPeriods({ workspaceId }),
            readUpdatedComputedPropertyState({ workspaceId }),
            Promise.all(debugQueries ?? []),
          ]);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const logged: Record<string, any> = {
            assignments: assignments.filter((a) =>
              step.userId ? a.user_id === step.userId : true,
            ),
            states: states.filter((s) =>
              step.userId ? s.user_id === step.userId : true,
            ),
            resolvedSegmentStates: resolvedSegmentStates.filter((s) =>
              step.userId ? s.user_id === step.userId : true,
            ),
            updatedComputedPropertyState: updatedComputedPropertyState.filter(
              (s) => (step.userId ? s.user_id === step.userId : true),
            ),
            periods,
            stepContext,
          };
          for (const { name, query, data } of debugQueryData) {
            logged[name] = {
              query,
              data,
            };
          }
          logger().warn(
            logged,
            `debug clickhouse values:${step.description ? ` ${step.description}` : ""}`,
          );
          break;
        }
        case EventsStepType.ComputeProperties: {
          logger().debug(
            {
              segments,
              userProperties,
            },
            "computeProperties step",
          );
          await runComputePropertiesIncrementalWithCounters({
            args: {
              workspaceId,
              segments,
              userProperties,
              integrations: [],
              journeys,
              now,
            },
            counters: clickhouseCounters,
          });
          break;
        }
        case EventsStepType.Sleep:
          now += step.timeMs;
          logger().debug(
            {
              now,
            },
            "sleep step",
          );
          break;
        case EventsStepType.Delay:
          // eslint-disable-next-line no-promise-executor-return
          await new Promise((resolve) => setTimeout(resolve, step.timeMs));
          break;
        case EventsStepType.Assert: {
          const usersAssertions =
            step.users?.map(async (userOrFn) => {
              let user: TableUser;
              if (typeof userOrFn === "function") {
                user = userOrFn(stepContext);
              } else {
                user = userOrFn;
              }
              await Promise.all([
                user.properties
                  ? findAllUserPropertyAssignments({
                      userId: user.id,
                      workspaceId,
                    }).then((up) =>
                      expect(
                        // only check the user id if it's explicitly asserted
                        // upon, for convenience
                        user.properties?.id ? up : omit(up, ["id"]),
                        `${
                          step.description ? `${step.description}: ` : ""
                        }user properties for: ${user.id}`,
                      ).toEqual(user.properties),
                    )
                  : null,
                user.segments
                  ? findAllSegmentAssignments({
                      userId: user.id,
                      workspaceId,
                    }).then((s) => {
                      expect(
                        s,
                        `${
                          step.description ? `${step.description}: ` : ""
                        }segments for: ${user.id}`,
                      ).toEqual(user.segments);
                    })
                  : null,
              ]);
            }) ?? [];
          const userCountAssertion = step.userCount
            ? (async () => {
                const userCounts = await getUserCounts(workspaceId);

                expect(userCounts, step.description).toEqual({
                  eventsUserCount: step.userCount,
                  stateUserCount: step.userCount,
                  assignmentUserCount: step.userCount,
                });
              })()
            : null;
          const statesAssertions = step.states
            ? (async () => {
                const states = await readStates({ workspaceId });
                const actualTestStates = states.map((s) =>
                  toTestState(s, userProperties, segments),
                );
                for (const expected of step.states ?? []) {
                  const expectedState =
                    typeof expected === "function"
                      ? expected(stepContext)
                      : expected;

                  const actualState = actualTestStates.find(
                    (s) =>
                      s.userId === expectedState.userId &&
                      s.name === expectedState.name &&
                      s.type === expectedState.type &&
                      s.nodeId === expectedState.nodeId,
                  );
                  expect(
                    actualState,
                    `${["expected state", step.description]
                      .filter((s) => !!s)
                      .join(" - ")}:\n\n${JSON.stringify(
                      expectedState,
                      null,
                      2,
                    )}\n\nto be found in actual states:\n\n${JSON.stringify(
                      actualTestStates,
                      null,
                      2,
                    )}`,
                  ).not.toBeUndefined();
                  if (expectedState.lastValue) {
                    expect(actualState, step.description).toHaveProperty(
                      "lastValue",
                      expectedState.lastValue,
                    );
                  }
                  if (expectedState.uniqueCount) {
                    expect(actualState, step.description).toHaveProperty(
                      "uniqueCount",
                      expectedState.uniqueCount,
                    );
                  }
                  if (expectedState.maxEventTime) {
                    expect(actualState, step.description).toHaveProperty(
                      "maxEventTime",
                      expectedState.maxEventTime,
                    );
                  }
                }
              })()
            : null;
          const indexedStatesAssertions = step.indexedStates
            ? (async () => {
                const indexedStates = await readIndexed({ workspaceId });
                const actualTestStates = indexedStates.map((s) =>
                  toTestIndexedState(s, userProperties, segments),
                );
                for (const expected of step.indexedStates ?? []) {
                  const expectedState =
                    typeof expected === "function"
                      ? expected(stepContext)
                      : expected;

                  const actualState = actualTestStates.find(
                    (s) =>
                      s.userId === expectedState.userId &&
                      s.name === expectedState.name &&
                      s.type === expectedState.type &&
                      s.nodeId === expectedState.nodeId,
                  );
                  expect(
                    actualState,
                    `${["expected indexed state", step.description]
                      .filter((s) => !!s)
                      .join(" - ")}:\n\n${JSON.stringify(
                      expectedState,
                      null,
                      2,
                    )}\n\nto be found in actual indexed states:\n\n${JSON.stringify(
                      actualTestStates,
                      null,
                      2,
                    )}`,
                  ).not.toBeUndefined();

                  expect(actualState, step.description).toHaveProperty(
                    "indexedValue",
                    expectedState.indexedValue,
                  );
                }
              })()
            : null;
          const periodsAssertions = step.periods
            ? (async () => {
                const periods =
                  await db().query.computedPropertyPeriod.findMany({
                    where: eq(
                      schema.computedPropertyPeriod.workspaceId,
                      workspaceId,
                    ),
                    orderBy: [asc(schema.computedPropertyPeriod.createdAt)],
                  });
                const simplifiedPeriods = periods.map((p) => {
                  const s: TestPeriod = {
                    to: p.to.getTime() - now,
                    step: p.step as ComputedPropertyStep,
                  };
                  const from = p.from ? p.from.getTime() - now : undefined;
                  if (from) {
                    s.from = from;
                  }
                  return s;
                });
                if (step.periods) {
                  expect(
                    simplifiedPeriods,
                    "should have the same number of periods as expected",
                  ).toHaveLength(step.periods.length);

                  for (const expected of step.periods) {
                    expect(simplifiedPeriods, step.description).toContainEqual(
                      expected,
                    );
                  }
                }
              })()
            : null;
          const resolvedSegmentStatesAssertions = step.resolvedSegmentStates
            ? (async () => {
                const resolvedSegmentStates = await readResolvedSegmentStates({
                  workspaceId,
                });
                const actualTestStates = resolvedSegmentStates.flatMap((s) => {
                  const resolved = toTestResolvedSegmentState(s, segments);
                  return resolved ?? [];
                });
                for (const expected of step.resolvedSegmentStates ?? []) {
                  const actualState = actualTestStates.find(
                    (s) =>
                      s.userId === expected.userId && s.name === expected.name,
                  );
                  expect(
                    actualState,
                    `${["expected resolved segment state", step.description]
                      .filter((s) => !!s)
                      .join(" - ")}:\n\n${JSON.stringify(
                      expected,
                      null,
                      2,
                    )}\n\nto be found in actual resolved segment states:\n\n${JSON.stringify(
                      actualTestStates,
                      null,
                      2,
                    )}`,
                  ).not.toBeUndefined();

                  expect(
                    actualState,
                    `${[
                      "expected resolved segment state to have a different value",
                      step.description,
                    ]
                      .filter((s) => !!s)
                      .join(" - ")}:\n\n${JSON.stringify(expected, null, 2)}`,
                  ).toHaveProperty(
                    "segmentStateValue",
                    expected.segmentStateValue,
                  );
                }
              })()
            : null;

          // start all work to assert, but then await assertions in the same
          // order that they are computed in the tested code
          await statesAssertions;
          await periodsAssertions;
          await indexedStatesAssertions;
          await resolvedSegmentStatesAssertions;
          await userCountAssertion;
          await Promise.all(usersAssertions);

          for (const assertedJourney of step.journeys ?? []) {
            const journey = journeys.find(
              (j) => j.name === assertedJourney.journeyName,
            );
            if (!journey) {
              throw new Error(
                `could not find journey with name: ${assertedJourney.journeyName}`,
              );
            }
            const { calls } = signalWithStart.mock;
            const timesForJourney = calls.filter(
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              (c) => c[1].args[0].journeyId === journey.id,
            ).length;

            if (assertedJourney.times !== undefined) {
              expect(timesForJourney).toEqual(assertedJourney.times);
            }
          }
          if (step.clickhouseCounts) {
            const { commands, queries } = step.clickhouseCounts;
            if (commands !== undefined) {
              const message = buildClickhouseExpectationMessage({
                description: step.description,
                expected: commands,
                actual: clickhouseCounters.commands,
                type: "command",
                calls: clickhouseCounters.commandCalls,
              });
              expect(clickhouseCounters.commands, message).toEqual(commands);
            }
            if (queries !== undefined) {
              const message = buildClickhouseExpectationMessage({
                description: step.description,
                expected: queries,
                actual: clickhouseCounters.queries,
                type: "query",
                calls: clickhouseCounters.queryCalls,
              });
              expect(clickhouseCounters.queries, message).toEqual(queries);
            }
          }
          break;
        }
        case EventsStepType.UpdateComputedProperty: {
          let segmentsAndUserProperties: Required<
            Pick<UpdateComputedPropertyStep, "userProperties" | "segments">
          >;
          if (step.updater) {
            const updaterResult = step.updater(stepContext);
            segmentsAndUserProperties = {
              userProperties: updaterResult.userProperties ?? [],
              segments: updaterResult.segments ?? [],
            };
          } else {
            segmentsAndUserProperties = {
              userProperties: step.userProperties ?? [],
              segments: step.segments ?? [],
            };
          }

          const computedProperties = await upsertComputedProperties({
            workspaceId,
            now,
            ...segmentsAndUserProperties,
          });
          segments = computedProperties.segments;
          userProperties = computedProperties.userProperties;
          break;
        }
        case EventsStepType.UpdateJourney: {
          journeys = await upsertJourneys({
            workspaceId,
            now,
            journeys: step.journeys,
            context: stepContext,
          });
          break;
        }
        default:
          assertUnreachable(step);
      }
    }
  });
});
