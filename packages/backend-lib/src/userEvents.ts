import { ok, Result } from "neverthrow";

import { clickhouseClient } from "./clickhouse";
import config from "./config";
import { kafkaProducer } from "./kafka";
import prisma from "./prisma";
import { InternalEventType, UserEvent } from "./types";
import { buildUserEventsTableName } from "./userEvents/clickhouse";

export async function writeUserEvents(
  userEvents: {
    messageRaw: string;
    processingTime?: string;
    workspaceId: string;
    messageId: string;
  }[]
) {
  const { userEventsTopicName } = config();
  await kafkaProducer.send({
    topic: userEventsTopicName,
    messages: userEvents.map(
      ({ messageRaw, messageId, processingTime, workspaceId }) => ({
        key: messageId,
        value: JSON.stringify({
          processing_time: processingTime,
          workspace_id: workspaceId,
          message_raw: messageRaw,
        }),
      })
    ),
  });
}

export async function findAllUserTraits({
  workspaceId,
  tableVersion: tableVersionParam,
}: {
  workspaceId: string;
  tableVersion?: string;
}): Promise<string[]> {
  let tableVersion = tableVersionParam;
  if (!tableVersion) {
    const currentTable = await prisma.currentUserEventsTable.findUnique({
      where: {
        workspaceId,
      },
    });

    if (!currentTable) {
      return [];
    }
    tableVersion = currentTable.version;
  }

  const query = `SELECT DISTINCT arrayJoin(JSONExtractKeys(message_raw, 'traits')) AS trait FROM ${buildUserEventsTableName(
    tableVersion
  )} WHERE workspace_id = {workspaceId:String}`;

  const resultSet = await clickhouseClient().query({
    query,
    format: "JSONEachRow",
    query_params: {
      workspaceId,
    },
  });

  const results = await resultSet.json<{ trait: string }[]>();
  return results.map((o) => o.trait);
}

export async function findManyEvents({
  workspaceId,
  limit,
  offset = 0,
  tableVersion: tableVersionParam,
}: {
  workspaceId: string;
  tableVersion?: string;
  limit?: number;
  offset?: number;
}): Promise<UserEvent[]> {
  let tableVersion = tableVersionParam;
  if (!tableVersion) {
    const currentTable = await prisma.currentUserEventsTable.findUnique({
      where: {
        workspaceId,
      },
    });

    if (!currentTable) {
      return [];
    }
    tableVersion = currentTable.version;
  }

  const paginationCaluse = limit ? `LIMIT ${offset},${limit}` : "";
  const query = `SELECT * FROM ${buildUserEventsTableName(
    tableVersion
  )} WHERE workspace_id = {workspaceId:String} ${paginationCaluse}`;

  const resultSet = await clickhouseClient().query({
    query,
    format: "JSONEachRow",
    query_params: {
      workspaceId,
    },
  });

  const results = await resultSet.json<UserEvent[]>();
  return results;
}

// TODO implement pagination
export async function findManyInternalEvents({
  event,
  workspaceId,
}: {
  event: InternalEventType;
  workspaceId: string;
}): Promise<UserEvent[]> {
  const tableVersion = await prisma.currentUserEventsTable.findUnique({
    where: {
      workspaceId,
    },
  });

  if (!tableVersion) {
    return [];
  }

  const query = `SELECT * FROM ${buildUserEventsTableName(
    tableVersion.version
  )} WHERE event_type = 'track' AND event = {event:String} AND workspace_id = {workspaceId:String}`;

  const resultSet = await clickhouseClient().query({
    query,
    format: "JSONEachRow",
    query_params: {
      event,
      workspaceId,
    },
  });

  const results = await resultSet.json<UserEvent[]>();
  return results;
}

export async function trackInternalEvents(props: {
  workspaceId: string;
  events: {
    event: InternalEventType;
    messageId: string;
    properties: Record<string, string>;
  }[];
}): Promise<Result<void, Error>> {
  const timestamp = new Date().toISOString();

  const events = props.events
    .map((p) => ({
      type: "track",
      event: p.event,
      userId: p.properties.userId,
      anonymousId: p.properties.anonymousId,
      messageId: p.messageId,
      properties: p.properties,
      timestamp,
    }))
    .map((mr) => ({
      workspaceId: props.workspaceId,
      messageId: mr.messageId,
      messageRaw: JSON.stringify(mr),
    }));

  await writeUserEvents(events);

  return ok(undefined);
}
