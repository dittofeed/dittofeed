import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { omit } from "remeda";

import { clickhouseClient, ClickHouseQueryBuilder } from "../clickhouse";
import prisma from "../prisma";
import { findAllSegmentAssignments, toSegmentResource } from "../segments";
import {
  BatchAppData,
  BatchItem,
  ComputedPropertyAssignment,
  EventType,
  JSONValue,
  KnownBatchIdentifyData,
  KnownBatchTrackData,
  SavedUserPropertyResource,
  SegmentResource,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyResource,
} from "../types";
import {
  findAllUserPropertyAssignments,
  toUserPropertyResource,
} from "../userProperties";
import {
  computeAssignments,
  computeState,
  createTables,
  dropTables,
  processAssignments,
} from "./computeProperties";
import { buildBatchUserEvents } from "../apps";
import { insertUserEvents } from "../userEvents";

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

interface TableTest {
  description: string;
  skip?: boolean;
  only?: boolean;
  userProperties: Pick<UserPropertyResource, "name" | "definition">[];
  segments: Pick<SegmentResource, "name" | "definition">[];
  events: TableEvent[];
  users?: TableUser[];
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
      users: [
        {
          id: "user-1",
          properties: {
            email: "test@email.com",
          },
        },
      ],
    },
  ];

  const only: null | string =
    tests.find((t) => t.only === true)?.description ?? null;

  test.concurrent.each(tests.filter((t) => t.skip !== true))(
    "$description",
    async (test) => {
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

      const now = Date.now();

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
        submitBatch({
          workspaceId,
          data: test.events,
          now,
        }),
      ]);

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
      });

      await processAssignments({
        workspaceId,
        segments,
        integrations: [],
        journeys: [],
        userProperties,
      });

      test.users?.map(async (user) => {
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
      });
    }
  );
});
