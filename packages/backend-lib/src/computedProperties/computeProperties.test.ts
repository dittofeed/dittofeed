/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable no-await-in-loop */
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { buildBatchUserEvents } from "../apps";
import {
  clickhouseClient,
  clickhouseDateToIso,
  ClickHouseQueryBuilder,
} from "../clickhouse";
import prisma from "../prisma";
import { findAllSegmentAssignments, toSegmentResource } from "../segments";
import {
  BatchAppData,
  ComputedPropertyAssignment,
  EventType,
  JSONValue,
  KnownBatchIdentifyData,
  KnownBatchTrackData,
  ParsedPerformedManyValueItem,
  RelationalOperators,
  SavedSegmentResource,
  SavedUserPropertyResource,
  SegmentHasBeenOperatorComparator,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentResource,
  UserPropertyDefinitionType,
  UserPropertyResource,
} from "../types";
import { insertUserEvents } from "../userEvents";
import {
  findAllUserPropertyAssignments,
  toUserPropertyResource,
} from "../userProperties";
import {
  computeAssignments,
  ComputedPropertyStep,
  computeState,
  createTables,
  dropTables,
  processAssignments,
  segmentNodeStateId,
  segmentNodeToStateSubQuery,
  userPropertyStateId,
} from "./computeProperties";
import logger from "../logger";
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";

jest.setTimeout(Math.pow(10, 5));

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readAssignments({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<ComputedPropertyAssignment[]> {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select *
    from computed_property_assignments_v2
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
  `;
  const response = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
  });
  const values: { data: ComputedPropertyAssignment[] } = await response.json();
  return values.data;
}

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

async function readStates({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<State[]> {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select
      type,
      computed_property_id,
      state_id,
      user_id,
      argMaxMerge(last_value) as last_value,
      uniqMerge(unique_count) as unique_count,
      maxMerge(max_event_time) as max_event_time,
      groupArrayMerge(grouped_message_ids) as grouped_message_ids,
      max(computed_at)
    from computed_property_state
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
    group by
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
  ).json()) as { data: State[] };
  return response.data;
}

interface Processed {
  workspace_id: string;
  user_id: string;
  type: "segment" | "user_property";
  computed_property_id: string;
  processed_for: string;
  processed_for_type: string;
  segment_value: number;
  user_property_value: string;
  max_event_time: string;
  processed_at: string;
}

async function readProcessed({}: {
  workspaceId: string;
}): Promise<Processed[]> {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select *
    from processed_computed_properties_v2
  `;
  const response: { data: Processed[] } = await (
    await clickhouseClient().query({
      query,
      query_params: qb.getQueries(),
    })
  ).json();
  return response.data;
}

async function readEvents({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<unknown[]> {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select *
    from user_events_v2
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
  `;
  const response = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
  });
  return response.json();
}

type TableEventCommon<T> = Omit<T, "messageId" | "timestamp"> & {
  offsetMs: number;
};

type TableEvent =
  | TableEventCommon<KnownBatchIdentifyData>
  | TableEventCommon<KnownBatchTrackData>;

async function submitBatch({
  workspaceId,
  data,
  now,
}: {
  workspaceId: string;
  data: TableEvent[];
  now: number;
}) {
  const processingTimes = data.map((e) =>
    new Date(e.offsetMs + now).toISOString()
  );
  const batchAppData: BatchAppData = {
    batch: data.map((e, i) => {
      const processingTime = processingTimes[i];
      if (!processingTime) {
        throw new Error("processingTime not found");
      }
      return {
        ...e,
        messageId: randomUUID(),
        timestamp: processingTime,
      };
    }),
  };

  const userEvents = buildBatchUserEvents(batchAppData).map((e, i) => {
    const processingTime = processingTimes[i];
    if (!processingTime) {
      throw new Error("processingTime not found");
    }
    return {
      ...e,
      processingTime,
    };
  });
  await insertUserEvents({
    workspaceId,
    userEvents,
  });
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

function toTestState(
  state: State,
  userProperties: SavedUserPropertyResource[],
  segments: SavedSegmentResource[]
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
        throw new Error("userProperty not found");
      }
      let nodeId: string | undefined;
      if (userProperty.definition.type === UserPropertyDefinitionType.Group) {
        nodeId = userProperty.definition.nodes.find(
          (n) => userPropertyStateId(userProperty, n.id) === state.state_id
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
  segments?: Record<string, boolean>;
}

enum EventsStepType {
  SubmitEvents = "SubmitEvents",
  ComputeProperties = "ComputeProperties",
  Assert = "Assert",
  Sleep = "Sleep",
  DebugAssignments = "DebugAssignments",
}

interface StepContext {
  now: number;
}

type EventBuilder = (ctx: StepContext) => TableEvent;

interface SubmitEventsStep {
  type: EventsStepType.SubmitEvents;
  events: (TableEvent | EventBuilder)[];
}

interface ComputePropertiesStep {
  type: EventsStepType.ComputeProperties;
}

interface DebugAssignmentsStep {
  type: EventsStepType.DebugAssignments;
}

interface SleepStep {
  type: EventsStepType.Sleep;
  timeMs: number;
}

interface TestPeriod {
  from?: number;
  to: number;
  step: ComputedPropertyStep;
}

interface AssertStep {
  type: EventsStepType.Assert;
  description?: string;
  users?: (TableUser | ((ctx: StepContext) => TableUser))[];
  states?: (TestState | ((ctx: StepContext) => TestState))[];
  periods?: TestPeriod[];
}

type TableStep =
  | SubmitEventsStep
  | ComputePropertiesStep
  | AssertStep
  | SleepStep
  | DebugAssignmentsStep;

interface TableTest {
  description: string;
  skip?: boolean;
  only?: boolean;
  userProperties: Pick<UserPropertyResource, "name" | "definition">[];
  segments: Pick<SegmentResource, "name" | "definition">[];
  steps: TableStep[];
}

describe("computeProperties", () => {
  beforeAll(async () => {
    await createTables();
  });
  afterAll(async () => {
    await dropTables();
  });

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
              step: ComputedPropertyStep.ComputeState,
            },
            {
              to: 0,
              step: ComputedPropertyStep.ComputeAssignments,
            },
            {
              to: 0,
              step: ComputedPropertyStep.ProcessAssignments,
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
              step: ComputedPropertyStep.ComputeState,
            },
            {
              to: -1000,
              step: ComputedPropertyStep.ComputeAssignments,
            },
            {
              to: -1000,
              step: ComputedPropertyStep.ProcessAssignments,
            },
            {
              from: -1000,
              to: 0,
              step: ComputedPropertyStep.ComputeState,
            },
            {
              from: -1000,
              to: 0,
              step: ComputedPropertyStep.ComputeAssignments,
            },
            {
              from: -1000,
              to: 0,
              step: ComputedPropertyStep.ProcessAssignments,
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
                newUsers: false,
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
                stuckOnboarding: false,
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
              maxEventTime: new Date(now - 100 - 50).toISOString(),
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
                now - (1000 * 60 * 60 * 24 * 7 + 60 * 1000) - 100 - 50
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
              maxEventTime: new Date(
                now - (1000 * 60 * 60 * 24 * 7 + 60 * 1000) - 50 - 500 - 100
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
                now - 1000 * 60 * 60 * 24 * 7 - 100
              ).toISOString(),
            }),
          ],
          users: [
            {
              id: "user-1",
              segments: {
                stuckOnboarding: false,
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
                doubleNested: false,
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
                performed: false,
              },
            },
            {
              id: "user-3",
              segments: {
                performed: false,
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
                performed: false,
              },
            },
            {
              id: "user-3",
              segments: {
                performed: false,
              },
            },
            {
              id: "user-4",
              segments: {
                performed: false,
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
                lastPerformed: false,
              },
            },
            {
              id: "user-3",
              segments: {
                lastPerformed: false,
              },
            },
            {
              id: "user-4",
              segments: {
                lastPerformed: false,
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
              offsetMs: -150,
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
                    event: "test1",
                    timestamp: format(
                      utcToZonedTime(new Date(now - 150), "UTC"),
                      "yyyy-MM-dd'T'HH:mm:ss"
                    ),
                    properties: {
                      prop1: "value1",
                    },
                  },
                  {
                    event: "test2",
                    timestamp: format(
                      utcToZonedTime(new Date(now - 100), "UTC"),
                      "yyyy-MM-dd'T'HH:mm:ss"
                    ),
                    properties: {
                      prop2: "value2",
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
    // TODO subscription group
  ];
  const only: null | string =
    tests.find((t) => t.only === true)?.description ?? null;

  test.concurrent.each(
    tests.filter(
      (t) => t.skip !== true && (only === null || only === t.description)
    )
  )("$description", async (test) => {
    if (only && test.description !== only) {
      return;
    }

    const workspace = await prisma().workspace.create({
      data: {
        name: randomUUID(),
      },
    });
    const workspaceId = workspace.id;

    await prisma().currentUserEventsTable.create({
      data: {
        workspaceId,
        version: "v2",
      },
    });

    let now = Date.now();

    const [userProperties, segments] = await Promise.all([
      Promise.all(
        test.userProperties.map(async (up) => {
          const model = await prisma().userProperty.create({
            data: {
              workspaceId,
              name: up.name,
              definition: up.definition,
            },
          });
          return unwrap(toUserPropertyResource(model));
        })
      ),
      Promise.all(
        test.segments.map(async (s) => {
          const model = await prisma().segment.create({
            data: {
              workspaceId,
              name: s.name,
              definition: s.definition,
            },
          });
          return unwrap(toSegmentResource(model));
        })
      ),
    ]);

    for (const step of test.steps) {
      const stepContext: StepContext = {
        now,
      };
      switch (step.type) {
        case EventsStepType.SubmitEvents: {
          const events: TableEvent[] = [];
          for (const event of step.events) {
            if (typeof event === "function") {
              events.push(await event(stepContext));
            } else {
              events.push(event);
            }
          }
          await submitBatch({
            workspaceId,
            data: events,
            now,
          });
          break;
        }
        case EventsStepType.DebugAssignments: {
          const assignments = await readAssignments({ workspaceId });
          logger().warn(
            {
              assignments,
            },
            "debug assignments"
          );
          break;
        }
        case EventsStepType.ComputeProperties:
          await computeState({
            workspaceId,
            segments,
            now,
            userProperties,
          });
          await computeAssignments({
            workspaceId,
            segments,
            userProperties,
            now,
          });
          await processAssignments({
            workspaceId,
            segments,
            integrations: [],
            journeys: [],
            userProperties,
            now,
          });
          break;
        case EventsStepType.Sleep:
          now += step.timeMs;
          break;
        case EventsStepType.Assert:
          await Promise.all([
            ...(step.users?.map(async (userOrFn) => {
              let user: TableUser;
              if (typeof userOrFn === "function") {
                user = await userOrFn(stepContext);
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
                        up,
                        `${
                          step.description ? `${step.description}: ` : ""
                        }user properties for: ${user.id}`
                      ).toEqual(user.properties)
                    )
                  : null,
                user.segments
                  ? findAllSegmentAssignments({
                      userId: user.id,
                      workspaceId,
                    }).then((s) =>
                      expect(
                        s,
                        `${
                          step.description ? `${step.description}: ` : ""
                        }segments for: ${user.id}`
                      ).toEqual(user.segments)
                    )
                  : null,
              ]);
            }) ?? []),
            step.states
              ? (async () => {
                  const states = await readStates({ workspaceId });
                  const actualTestStates = states.map((s) =>
                    toTestState(s, userProperties, segments)
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
                        s.nodeId === expectedState.nodeId
                    );
                    expect(
                      actualState,
                      `${["expected state", step.description]
                        .filter((s) => !!s)
                        .join(" - ")}:\n\n${JSON.stringify(
                        expectedState,
                        null,
                        2
                      )}\n\nto be found in actual states:\n\n${JSON.stringify(
                        actualTestStates,
                        null,
                        2
                      )}`
                    ).not.toBeUndefined();
                    if (expectedState.lastValue) {
                      expect(actualState, step.description).toHaveProperty(
                        "lastValue",
                        expectedState.lastValue
                      );
                    }
                    if (expectedState.uniqueCount) {
                      expect(actualState, step.description).toHaveProperty(
                        "uniqueCount",
                        expectedState.uniqueCount
                      );
                    }
                    if (expectedState.maxEventTime) {
                      expect(actualState, step.description).toHaveProperty(
                        "maxEventTime",
                        expectedState.maxEventTime
                      );
                    }
                  }
                })()
              : null,
            step.periods
              ? (async () => {
                  const periods =
                    await prisma().computedPropertyPeriod.findMany({
                      where: {
                        workspaceId,
                      },
                      orderBy: [
                        {
                          createdAt: "asc",
                        },
                      ],
                    });
                  const simplifiedPeriods = periods.map((p) => {
                    const s: TestPeriod = {
                      to: p.to.getTime() - now,
                      step: p.step as ComputedPropertyStep,
                    };
                    if (p.from !== undefined) {
                      s.from = p.from ? p.from.getTime() - now : undefined;
                    }
                    return s;
                  });
                  expect(simplifiedPeriods, step.description).toEqual(
                    step.periods
                  );
                })()
              : null,
          ]);
          break;
      }
    }
  });
});
