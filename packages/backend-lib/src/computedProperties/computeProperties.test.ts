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
} from "./computeProperties";

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

async function readStates({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<unknown[]> {
  const qb = new ClickHouseQueryBuilder();
  const query = `
    select
      type,
      computed_property_id,
      state_id,
      user_id,
      argMaxMerge(last_value) as last_value,
      uniqMerge(unique_count) as unique_count,
      maxMerge(max_event_time) as max_event_time
    from computed_property_state
    where workspace_id = ${qb.addQueryValue(workspaceId, "String")}
    group by
      type,
      computed_property_id,
      state_id,
      user_id
  `;
  const response = await clickhouseClient().query({
    query,
    query_params: qb.getQueries(),
  });
  return response.json();
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
}

interface SubmitEventsStep {
  type: EventsStepType.SubmitEvents;
  events: TableEvent[];
}

interface ComputePropertiesStep {
  type: EventsStepType.ComputeProperties;
}

interface SleepStep {
  type: EventsStepType.Sleep;
  timeMs: number;
}

interface AssertStep {
  type: EventsStepType.Assert;
  users?: TableUser[];
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
  | SleepStep;

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
      only: true,
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
      switch (step.type) {
        case EventsStepType.SubmitEvents:
          await submitBatch({
            workspaceId,
            data: step.events,
            now,
          });
          break;
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
                    }).then((up) => expect(up).toEqual(user.properties))
                  : null,
                user.segments
                  ? findAllSegmentAssignments({
                      userId: user.id,
                      workspaceId,
                    }).then((s) => expect(s).toEqual(user.segments))
                  : null,
              ]);
            }) ?? []),
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
                  expect(simplifiedPeriods).toEqual(step.periods);
                })()
              : null,
          ]);
          break;
      }
    }
  });
});
