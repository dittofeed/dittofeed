/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable no-await-in-loop */
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { buildBatchUserEvents } from "../apps";
import { clickhouseClient, ClickHouseQueryBuilder } from "../clickhouse";
import prisma from "../prisma";
import { findAllSegmentAssignments, toSegmentResource } from "../segments";
import {
  BatchAppData,
  ComputedPropertyAssignment,
  EventType,
  JSONValue,
  KnownBatchIdentifyData,
  KnownBatchTrackData,
  SavedSegmentResource,
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
} from "./computeProperties";
import logger from "../logger";

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
  unique_count: number;
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
      computed_at
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
  // FIXME offset
}

function toTestState(
  state: State,
  userProperties: UserPropertyResource[],
  segments: SavedSegmentResource[]
): TestState {
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
        uniqueCount: state.unique_count,
        userId: state.user_id,
      };
    }
    case "user_property": {
      const userProperty = userProperties.find(
        (up) => up.id === state.computed_property_id
      );
      if (!userProperty) {
        throw new Error("userProperty not found");
      }
      // TODO set nodeId
      return {
        type: "user_property",
        name: userProperty.name,
        lastValue: state.last_value,
        uniqueCount: state.unique_count,
        userId: state.user_id,
      };
    }
  }
}

// interface TestAssignment {
//   type: "segment" | "user_property";
//   name: string;
//   nodeId: string;
//   segmentValue?: boolean;
//   userPropertyValue?: string;
//   // assignedAt
// }

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

interface AssertStep {
  type: EventsStepType.Assert;
  description?: string;
  users?: TableUser[];
  states?: (TestState | ((ctx: StepContext) => TestState))[];
  periods?: {
    from?: number;
    to: number;
    step: ComputedPropertyStep;
  }[];
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
      only: true,
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
        },
      ],
    },
    {
      description: "computes within operator trait segment",
      userProperties: [],
      skip: true,
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
        },
        {
          type: EventsStepType.ComputeProperties,
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
    const stepContext: StepContext = {
      now,
    };

    for (const step of test.steps) {
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
            ...(step.users?.map(async (user) => {
              await Promise.all([
                user.properties
                  ? findAllUserPropertyAssignments({
                      userId: user.id,
                      workspaceId,
                    }).then((up) =>
                      expect(up, step.description).toEqual(user.properties)
                    )
                  : null,
                user.segments
                  ? findAllSegmentAssignments({
                      userId: user.id,
                      workspaceId,
                    }).then((s) =>
                      expect(s, step.description).toEqual(user.segments)
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
                    expect(actualState, step.description).not.toBeUndefined();
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
                      orderBy: {
                        to: "asc",
                      },
                    });
                  const simplifiedPeriods = periods.map((p) => ({
                    from: p.from ? p.from.getTime() - now : undefined,
                    to: p.to.getTime() - now,
                    step: p.step,
                  }));
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
