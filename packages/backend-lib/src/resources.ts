import { and, asc, eq } from "drizzle-orm";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

import { db, Db } from "./db";
import * as schema from "./db/schema";
import { getMessageTemplates, getSubscribedSegments } from "./journeys";
import logger from "./logger";
import {
  BroadcastResourceVersion,
  ChannelType,
  DBResourceTypeEnum,
  DuplicateResourceRequest,
  DuplicateResourceResponse,
  DuplicateResourceType,
  DuplicateResourceTypeEnum,
  GetJourneysResourcesConfig,
  GetResourcesRequest,
  GetResourcesResponse,
  JourneyDefinition,
  MinimalJourneysResource,
} from "./types";

function buildDuplicateName(baseName: string, existingNames: string[]): string {
  const existing = new Set(existingNames);
  let index = 1;
  while (true) {
    const candidate = `${baseName} (${index})`;
    if (!existing.has(candidate)) {
      return candidate;
    }
    index += 1;
  }
}

async function fetchExistingNames({
  tx,
  workspaceId,
  resourceType,
}: {
  tx: Db;
  workspaceId: string;
  resourceType: DuplicateResourceType;
}): Promise<string[]> {
  switch (resourceType) {
    case DuplicateResourceTypeEnum.Segment: {
      const names = await tx
        .select({ name: schema.segment.name })
        .from(schema.segment)
        .where(
          and(
            eq(schema.segment.workspaceId, workspaceId),
            eq(schema.segment.resourceType, DBResourceTypeEnum.Declarative),
          ),
        );
      return names.map((row) => row.name);
    }
    case DuplicateResourceTypeEnum.MessageTemplate: {
      const names = await tx
        .select({ name: schema.messageTemplate.name })
        .from(schema.messageTemplate)
        .where(
          and(
            eq(schema.messageTemplate.workspaceId, workspaceId),
            eq(
              schema.messageTemplate.resourceType,
              DBResourceTypeEnum.Declarative,
            ),
          ),
        );
      return names.map((row) => row.name);
    }
    case DuplicateResourceTypeEnum.Journey: {
      const names = await tx
        .select({ name: schema.journey.name })
        .from(schema.journey)
        .where(
          and(
            eq(schema.journey.workspaceId, workspaceId),
            eq(schema.journey.resourceType, DBResourceTypeEnum.Declarative),
          ),
        );
      return names.map((row) => row.name);
    }
    case DuplicateResourceTypeEnum.Broadcast: {
      const names = await tx
        .select({ name: schema.broadcast.name })
        .from(schema.broadcast)
        .where(eq(schema.broadcast.workspaceId, workspaceId));
      return names.map((row) => row.name);
    }
    default:
      return [];
  }
}

export async function duplicateResource({
  name,
  workspaceId,
  resourceType,
}: DuplicateResourceRequest): Promise<DuplicateResourceResponse> {
  return db().transaction(async (tx) => {
    const existingNames = await fetchExistingNames({
      tx,
      workspaceId,
      resourceType,
    });

    switch (resourceType) {
      case DuplicateResourceTypeEnum.Segment: {
        const original = await tx.query.segment.findFirst({
          where: and(
            eq(schema.segment.workspaceId, workspaceId),
            eq(schema.segment.name, name),
            eq(schema.segment.resourceType, DBResourceTypeEnum.Declarative),
          ),
        });
        if (!original) {
          throw new Error(`Segment ${name} not found in workspace`);
        }
        const duplicateName = buildDuplicateName(name, existingNames);
        const inserted = await tx
          .insert(schema.segment)
          .values({
            workspaceId: original.workspaceId,
            name: duplicateName,
            definition: original.definition,
            resourceType: original.resourceType,
            subscriptionGroupId: original.subscriptionGroupId,
            status: original.status,
          })
          .returning({
            id: schema.segment.id,
            name: schema.segment.name,
          });
        const newSegment = inserted[0];
        if (!newSegment) {
          throw new Error("Failed to duplicate segment");
        }
        return newSegment;
      }
      case DuplicateResourceTypeEnum.MessageTemplate: {
        const original = await tx.query.messageTemplate.findFirst({
          where: and(
            eq(schema.messageTemplate.workspaceId, workspaceId),
            eq(schema.messageTemplate.name, name),
            eq(
              schema.messageTemplate.resourceType,
              DBResourceTypeEnum.Declarative,
            ),
          ),
        });
        if (!original) {
          throw new Error(`Message template ${name} not found in workspace`);
        }
        const duplicateName = buildDuplicateName(name, existingNames);
        const inserted = await tx
          .insert(schema.messageTemplate)
          .values({
            workspaceId: original.workspaceId,
            name: duplicateName,
            definition: original.definition,
            draft: original.draft,
            resourceType: original.resourceType,
          })
          .returning({
            id: schema.messageTemplate.id,
            name: schema.messageTemplate.name,
          });
        const newTemplate = inserted[0];
        if (!newTemplate) {
          throw new Error("Failed to duplicate message template");
        }
        return newTemplate;
      }
      case DuplicateResourceTypeEnum.Journey: {
        const original = await tx.query.journey.findFirst({
          where: and(
            eq(schema.journey.workspaceId, workspaceId),
            eq(schema.journey.name, name),
            eq(schema.journey.resourceType, DBResourceTypeEnum.Declarative),
          ),
        });
        if (!original) {
          throw new Error(`Journey ${name} not found in workspace`);
        }
        const duplicateName = buildDuplicateName(name, existingNames);
        const inserted = await tx
          .insert(schema.journey)
          .values({
            workspaceId: original.workspaceId,
            name: duplicateName,
            definition: original.definition,
            draft: original.draft,
            canRunMultiple: original.canRunMultiple,
            resourceType: original.resourceType,
          })
          .returning({
            id: schema.journey.id,
            name: schema.journey.name,
          });
        const newJourney = inserted[0];
        if (!newJourney) {
          throw new Error("Failed to duplicate journey");
        }
        return newJourney;
      }
      case DuplicateResourceTypeEnum.Broadcast: {
        const original = await tx.query.broadcast.findFirst({
          where: and(
            eq(schema.broadcast.workspaceId, workspaceId),
            eq(schema.broadcast.name, name),
          ),
        });
        if (!original) {
          throw new Error(`Broadcast ${name} not found in workspace`);
        }
        const duplicateName = buildDuplicateName(name, existingNames);
        const inserted = await tx
          .insert(schema.broadcast)
          .values({
            workspaceId: original.workspaceId,
            name: duplicateName,
            journeyId: original.journeyId,
            messageTemplateId: original.messageTemplateId,
            segmentId: original.segmentId,
            subscriptionGroupId: original.subscriptionGroupId,
            config: original.config,
            version: original.version,
          })
          .returning({
            id: schema.broadcast.id,
            name: schema.broadcast.name,
          });
        const newBroadcast = inserted[0];
        if (!newBroadcast) {
          throw new Error("Failed to duplicate broadcast");
        }
        return newBroadcast;
      }
      default:
        throw new Error(`Unsupported resource type ${resourceType}`);
    }
  });
}

async function getJourneysResources({
  workspaceId,
  config,
}: {
  workspaceId: string;
  config?: GetJourneysResourcesConfig;
}): Promise<MinimalJourneysResource[]> {
  const journeys = await db().query.journey.findMany({
    columns: {
      id: true,
      name: true,
      definition: true,
    },
    where: and(
      eq(schema.journey.workspaceId, workspaceId),
      eq(schema.journey.resourceType, "Declarative"),
    ),
    orderBy: [asc(schema.journey.name)],
  });
  return journeys.flatMap((journey) => {
    const resource: MinimalJourneysResource = {
      id: journey.id,
      name: journey.name,
    };

    const definitionResult = schemaValidateWithErr(
      journey.definition,
      JourneyDefinition,
    );
    if (definitionResult.isErr()) {
      logger().error(
        {
          journeyId: journey.id,
          error: definitionResult.error,
        },
        "Invalid journey definition",
      );
      return resource;
    }
    if (config?.segments) {
      const segments = Array.from(
        getSubscribedSegments(definitionResult.value),
      );
      resource.segments = segments;
    }
    if (config?.messageTemplates) {
      const messageTemplates = Array.from(
        getMessageTemplates(definitionResult.value),
      );
      resource.messageTemplates = messageTemplates;
    }
    return resource;
  });
}

export async function getResources({
  workspaceId,
  segments: shouldGetSegments,
  userProperties: shouldGetUserProperties,
  subscriptionGroups: shouldGetSubscriptionGroups,
  journeys: journeysConfig,
  messageTemplates: shouldGetMessageTemplates,
  broadcasts: shouldGetBroadcasts,
}: GetResourcesRequest): Promise<GetResourcesResponse> {
  const promises: [
    null | Promise<{ id: string; name: string }[]>,
    null | Promise<{ id: string; name: string }[]>,
    null | Promise<{ id: string; name: string; channel: string }[]>,
    null | Promise<MinimalJourneysResource[]>,
    null | Promise<{ id: string; name: string }[]>,
    null | Promise<
      { id: string; name: string; version: BroadcastResourceVersion | null }[]
    >,
  ] = [
    shouldGetSegments
      ? db().query.segment.findMany({
          columns: {
            id: true,
            name: true,
          },
          where: and(
            eq(schema.segment.workspaceId, workspaceId),
            eq(schema.segment.resourceType, "Declarative"),
          ),
          orderBy: [asc(schema.segment.name)],
        })
      : null,
    shouldGetUserProperties
      ? db().query.userProperty.findMany({
          columns: {
            id: true,
            name: true,
          },
          where: and(
            eq(schema.userProperty.workspaceId, workspaceId),
            eq(schema.userProperty.resourceType, "Declarative"),
          ),
          orderBy: [asc(schema.userProperty.name)],
        })
      : null,
    shouldGetSubscriptionGroups
      ? db().query.subscriptionGroup.findMany({
          columns: {
            id: true,
            name: true,
            channel: true,
          },
          where: eq(schema.subscriptionGroup.workspaceId, workspaceId),
          orderBy: [asc(schema.subscriptionGroup.name)],
        })
      : null,
    journeysConfig
      ? getJourneysResources({
          workspaceId,
          config:
            typeof journeysConfig === "boolean" ? undefined : journeysConfig,
        })
      : null,
    shouldGetMessageTemplates
      ? db().query.messageTemplate.findMany({
          columns: {
            id: true,
            name: true,
          },
          where: and(
            eq(schema.messageTemplate.workspaceId, workspaceId),
            eq(schema.messageTemplate.resourceType, "Declarative"),
          ),
          orderBy: [asc(schema.messageTemplate.name)],
        })
      : null,
    shouldGetBroadcasts
      ? db().query.broadcast.findMany({
          columns: {
            id: true,
            name: true,
            version: true,
          },
          where: eq(schema.broadcast.workspaceId, workspaceId),
          orderBy: [asc(schema.broadcast.name)],
        })
      : null,
  ];

  const [
    segments,
    userProperties,
    subscriptionGroups,
    journeys,
    messageTemplates,
    broadcasts,
  ] = await Promise.all(promises);

  const response: GetResourcesResponse = {};
  if (segments) {
    response.segments = segments.map((segment) => ({
      id: segment.id,
      name: segment.name,
    }));
  }
  if (userProperties) {
    response.userProperties = userProperties.map((userProperty) => ({
      id: userProperty.id,
      name: userProperty.name,
    }));
  }
  if (subscriptionGroups) {
    response.subscriptionGroups = subscriptionGroups.map(
      (subscriptionGroup) => ({
        id: subscriptionGroup.id,
        name: subscriptionGroup.name,
        channel: subscriptionGroup.channel as ChannelType,
      }),
    );
  }
  if (journeys) {
    response.journeys = journeys;
  }
  if (messageTemplates) {
    response.messageTemplates = messageTemplates.map((messageTemplate) => ({
      id: messageTemplate.id,
      name: messageTemplate.name,
    }));
  }

  if (broadcasts) {
    response.broadcasts = broadcasts.map((broadcast) => ({
      id: broadcast.id,
      name: broadcast.name,
      version: broadcast.version ?? undefined,
    }));
  }
  return response;
}
