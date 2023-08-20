import {
  getOauthToken,
  refreshToken,
  updateHubspotEmails,
  updateHubspotLists,
} from "backend-lib/src/integrations/hubspot/activities";
import prisma from "backend-lib/src/prisma";
import { randomUUID } from "crypto";
import {
  InternalEventType,
  ParsedPerformedManyValueItem,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
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
  let token = await getOauthToken({ workspaceId });
  if (!token) {
    throw new Error("no token found");
  }
  token = await refreshToken({ workspaceId, token: token.refreshToken });

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
  const emailUserProperty = await prisma().userProperty.upsert({
    where: {
      workspaceId_name: {
        workspaceId,
        name: "email",
      },
    },
    create: {
      workspaceId,
      name: "email",
      definition,
    },
    update: {
      definition,
    },
  });

  const emailValue = JSON.stringify(email);
  await prisma().userPropertyAssignment.upsert({
    where: {
      workspaceId_userPropertyId_userId: {
        workspaceId,
        userPropertyId: emailUserProperty.id,
        userId,
      },
    },
    create: {
      workspaceId,
      userPropertyId: emailUserProperty.id,
      userId,
      value: emailValue,
    },
    update: {
      workspaceId,
      userPropertyId: emailUserProperty.id,
      userId,
      value: emailValue,
    },
  });

  await updateHubspotEmails({
    workspaceId,
    userId,
    events,
  });

  const segment = await prisma().segment.upsert({
    where: {
      workspaceId_name: {
        workspaceId,
        name: "integrationExampleSegment",
      },
    },
    create: {
      workspaceId,
      name: "integrationExampleSegment",
      definition: {
        type: SegmentNodeType.Trait,
        path: "status",
        operator: {
          type: SegmentOperatorType.Equals,
        },
      },
    },
    update: {},
  });

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
