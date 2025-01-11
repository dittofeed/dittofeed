import {
  EMAIL_EVENTS_UP_NAME,
  HUBSPOT_INTEGRATION,
} from "backend-lib/src/constants";
import { upsert } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import {
  getIntegrationEnabled,
  refreshToken,
  updateHubspotEmails,
  updateHubspotLists,
} from "backend-lib/src/integrations/hubspot/activities";
import logger from "backend-lib/src/logger";
import { insertUserPropertyAssignments } from "backend-lib/src/userProperties";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  IntegrationType,
  InternalEventType,
  JsonResultType,
  ParsedPerformedManyValueItem,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SyncIntegration,
  TraitUserPropertyDefinition,
  UserPropertyDefinitionType,
} from "isomorphic-lib/src/types";

export async function hubspotSync({
  email,
  from,
  workspaceId,
  updateEmail = false,
}: {
  email: string;
  from?: string;
  workspaceId: string;
  updateEmail?: boolean;
}): Promise<void> {
  if (!(await getIntegrationEnabled({ workspaceId }))) {
    logger().info({ workspaceId }, "integration disabled");
    return;
  }
  const refreshedToken = await refreshToken({
    workspaceId,
  });
  if (refreshedToken.type === JsonResultType.Err) {
    logger().error({ workspaceId }, "error refreshing token");
    return;
  }

  const userId = randomUUID();
  const journeyId = "0a956342-4af8-427c-87f0-e4b0bcafec99";
  const runId = "8f8fd3bf-7dee-4c7f-aaa3-6fd0a2553c67";
  const nodeId1 = "7b05a770-cd95-4ed5-90c0-243d3e48b56c";
  const initialTimestamp = updateEmail
    ? "2023-08-19T18:42:44.443Z"
    : new Date().toISOString();
  const body = `<div>hello world</div>`;
  const subject = "hello world";

  const events: ParsedPerformedManyValueItem[] = [
    {
      event: InternalEventType.EmailOpened,
      timestamp: new Date().toISOString(),
      properties: {
        workspaceId,
        journeyId,
        nodeId1,
        runId,
        from,
      },
    },
    {
      event: InternalEventType.EmailDelivered,
      timestamp: new Date().toISOString(),
      properties: {
        workspaceId,
        journeyId,
        nodeId1,
        runId,
        from,
      },
    },
    {
      event: InternalEventType.MessageSent,
      timestamp: initialTimestamp,
      properties: {
        workspaceId,
        journeyId,
        nodeId1,
        runId,
        from,
        body,
        subject,
      },
    },
  ];

  const definition: TraitUserPropertyDefinition = {
    type: UserPropertyDefinitionType.Trait,
    path: "email",
  };
  const emailUserProperty = await upsert({
    table: schema.userProperty,
    values: {
      id: randomUUID(),
      workspaceId,
      name: "email",
      definition,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    target: [schema.userProperty.workspaceId, schema.userProperty.name],
    set: {
      definition,
    },
  }).then(unwrap);

  const emailValue = JSON.stringify(email);
  await insertUserPropertyAssignments([
    {
      workspaceId,
      userPropertyId: emailUserProperty.id,
      userId,
      value: emailValue,
    },
  ]);

  await updateHubspotEmails({
    workspaceId,
    userId,
    events,
  });

  const segmentDefinition: SegmentDefinition = {
    entryNode: {
      id: randomUUID(),
      type: SegmentNodeType.Trait,
      path: "status",
      operator: {
        type: SegmentOperatorType.Equals,
        value: "active",
      },
    },
    nodes: [],
  };
  const segmentName = "integrationExampleSegment-2";
  const segment = await upsert({
    table: schema.segment,
    values: {
      id: randomUUID(),
      workspaceId,
      name: segmentName,
      definition: segmentDefinition,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    target: [schema.segment.workspaceId, schema.segment.name],
    set: {
      definition: segmentDefinition,
    },
  }).then(unwrap);

  const integrationDefinition: SyncIntegration = {
    type: IntegrationType.Sync,
    subscribedSegments: [segment.name],
    subscribedUserProperties: [EMAIL_EVENTS_UP_NAME],
  };

  await upsert({
    table: schema.integration,
    values: {
      id: randomUUID(),
      workspaceId,
      name: HUBSPOT_INTEGRATION,
      enabled: true,
      definition: integrationDefinition,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    target: [schema.integration.workspaceId, schema.integration.name],
    set: {
      enabled: true,
      definition: integrationDefinition,
    },
  }).then(unwrap);

  await updateHubspotLists({
    workspaceId,
    userId,
    segments: [
      {
        type: "segment",
        segmentId: segment.id,
        currentlyInSegment: true,
        segmentVersion: new Date().getTime(),
      },
    ],
  });
}
