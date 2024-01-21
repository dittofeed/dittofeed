/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable no-await-in-loop */
import { randomUUID } from "crypto";
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";

import { submitBatch, TestEvent } from "../../test/testEvents";
import {
  clickhouseClient,
  clickhouseDateToIso,
  ClickHouseQueryBuilder,
} from "../clickhouse";
import { toJourneyResource } from "../journeys";
import logger from "../logger";
import prisma from "../prisma";
import { findAllSegmentAssignments, toSegmentResource } from "../segments";
import {
  ComputedPropertyAssignment,
  EventType,
  InternalEventType,
  JourneyDefinition,
  JourneyNodeType,
  JSONValue,
  ParsedPerformedManyValueItem,
  RelationalOperators,
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
  UserPropertyResource,
  Workspace,
} from "../types";
import {
  findAllUserPropertyAssignments,
  toSavedUserPropertyResource,
} from "../userProperties";
import {
  computeAssignments,
  ComputedPropertyStep,
  computeState,
  processAssignments,
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
  segments?: Record<string, boolean | null>;
}

enum EventsStepType {
  SubmitEvents = "SubmitEvents",
  ComputeProperties = "ComputeProperties",
  Assert = "Assert",
  Sleep = "Sleep",
  DebugAssignments = "DebugAssignments",
  UpdateComputedProperty = "UpdateComputedProperty",
}

interface StepContext {
  now: number;
  workspace: Workspace;
}

type EventBuilder = (ctx: StepContext) => TestEvent;

interface SubmitEventsStep {
  type: EventsStepType.SubmitEvents;
  events: (TestEvent | EventBuilder)[];
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

interface TestSignals {
  journeyName: string;
  times?: number;
}

interface AssertStep {
  type: EventsStepType.Assert;
  description?: string;
  users?: (TableUser | ((ctx: StepContext) => TableUser))[];
  states?: (TestState | ((ctx: StepContext) => TestState))[];
  periods?: TestPeriod[];
  journeys?: TestSignals[];
}

type TestUserProperty = Pick<UserPropertyResource, "name" | "definition">;
type TestSegment = Pick<SegmentResource, "name" | "definition">;
interface TestJourney {
  name: string;
  entrySegmentName: string;
}

interface UpdateComputedPropertyStep {
  type: EventsStepType.UpdateComputedProperty;
  userProperties?: TestUserProperty[];
  segments?: TestSegment[];
}

type TableStep =
  | SubmitEventsStep
  | ComputePropertiesStep
  | AssertStep
  | SleepStep
  | DebugAssignmentsStep
  | UpdateComputedPropertyStep;

interface TableTest {
  description: string;
  skip?: true;
  only?: true;
  userProperties?: TestUserProperty[];
  segments?: TestSegment[];
  journeys?: TestJourney[];
  steps: TableStep[];
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
  const [userPropertyResources, segmentResources] = await Promise.all([
    Promise.all(
      userProperties.map(async (up) => {
        const model = await prisma().userProperty.upsert({
          where: {
            workspaceId_name: {
              workspaceId,
              name: up.name,
            },
          },
          create: {
            workspaceId,
            name: up.name,
            definition: up.definition,
            definitionUpdatedAt: new Date(now),
          },
          update: {
            definition: up.definition,
            definitionUpdatedAt: new Date(now),
          },
        });
        return unwrap(toSavedUserPropertyResource(model));
      })
    ),
    Promise.all(
      segments.map(async (s) => {
        const model = await prisma().segment.upsert({
          where: {
            workspaceId_name: {
              workspaceId,
              name: s.name,
            },
          },
          create: {
            workspaceId,
            name: s.name,
            definition: s.definition,
            definitionUpdatedAt: new Date(now),
          },
          update: {
            definition: s.definition,
            definitionUpdatedAt: new Date(now),
          },
        });
        return unwrap(toSegmentResource(model));
      })
    ),
  ]);
  return {
    segments: segmentResources,
    userProperties: userPropertyResources,
  };
}

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
      description: "performed segment with nested properties",
      userProperties: [],
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
                      "yyyy-MM-dd'T'HH:mm:ss"
                    ),
                    properties: {
                      prop2: "value2",
                    },
                  },
                  {
                    event: "test1",
                    timestamp: format(
                      utcToZonedTime(new Date(now - 1000 * 60), "UTC"),
                      "yyyy-MM-dd'T'HH:mm:ss"
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
      userProperties: [],
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
          type: EventsStepType.Assert,
          description:
            "user is no longer in the segment after its definition is updated",
          users: [
            {
              id: "user-1",
              segments: {
                updatedPerformed: false,
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
                recentlyPerformed: false,
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
    let now = Date.now();

    let { userProperties, segments } = await upsertComputedProperties({
      workspaceId,
      userProperties: test.userProperties ?? [],
      segments: test.segments ?? [],
      now,
    });

    const journeys = await Promise.all(
      test.journeys?.map(({ name, entrySegmentName }) => {
        const segment = segments.find((s) => s.name === entrySegmentName);
        if (!segment) {
          throw new Error(
            `could not find segment with name: ${entrySegmentName}`
          );
        }
        const definition: JourneyDefinition = {
          entryNode: {
            type: JourneyNodeType.EntryNode,
            segment: segment.id,
            child: JourneyNodeType.ExitNode,
          },
          nodes: [],
          exitNode: {
            type: JourneyNodeType.ExitNode,
          },
        };
        return prisma().journey.upsert({
          where: {
            workspaceId_name: {
              workspaceId,
              name,
            },
          },
          create: {
            workspaceId,
            name,
            definition,
          },
          update: {},
        });
      }) ?? []
    );
    const journeyResources: SavedJourneyResource[] = journeys.map((j) =>
      unwrap(toJourneyResource(j))
    );

    for (const step of test.steps) {
      const stepContext: StepContext = {
        workspace,
        now,
      };
      switch (step.type) {
        case EventsStepType.SubmitEvents: {
          const events: TestEvent[] = [];
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
            journeys: journeyResources,
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
                    }).then((s) => {
                      expect(
                        s,
                        `${
                          step.description ? `${step.description}: ` : ""
                        }segments for: ${user.id}`
                      ).toEqual(user.segments);
                    })
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
                    s.from = p.from ? p.from.getTime() - now : undefined;
                    return s;
                  });
                  expect(simplifiedPeriods, step.description).toEqual(
                    step.periods
                  );
                })()
              : null,
          ]);
          for (const assertedJourney of step.journeys ?? []) {
            const journey = journeyResources.find(
              (j) => j.name === assertedJourney.journeyName
            );
            if (!journey) {
              throw new Error(
                `could not find journey with name: ${assertedJourney.journeyName}`
              );
            }
            if (assertedJourney.times !== undefined) {
              expect(signalWithStart).toHaveBeenCalledTimes(
                assertedJourney.times
              );
            }
            if (
              assertedJourney.times === undefined ||
              assertedJourney.times > 0
            ) {
              expect(signalWithStart).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({
                  args: [
                    expect.objectContaining({
                      journeyId: journey.id,
                    }),
                  ],
                })
              );
            }
          }
          break;
        case EventsStepType.UpdateComputedProperty: {
          const computedProperties = await upsertComputedProperties({
            workspaceId,
            now,
            userProperties: step.userProperties ?? [],
            segments: step.segments ?? [],
          });
          segments = computedProperties.segments;
          userProperties = computedProperties.userProperties;
          break;
        }
        default:
          assertUnreachable(step);
      }
    }
  });
});
