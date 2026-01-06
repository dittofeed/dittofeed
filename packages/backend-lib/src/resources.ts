import { and, asc, eq } from "drizzle-orm";
import protectedUserProperties from "isomorphic-lib/src/protectedUserProperties";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import { Db, db } from "./db";
import * as schema from "./db/schema";
import { getMessageTemplates, getSubscribedSegments } from "./journeys";
import logger from "./logger";
import {
  BroadcastResourceVersion,
  ChannelType,
  DBResourceTypeEnum,
  DuplicateResourceError,
  DuplicateResourceErrorType,
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

  // Strip existing " (N)" suffix if present to get the true base name
  const nameWithoutSuffix = baseName.replace(/\s+\(\d+\)$/, "");

  let index = 1;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    const candidate = `${nameWithoutSuffix} (${index})`;
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
    case DuplicateResourceTypeEnum.UserProperty: {
      const names = await tx
        .select({ name: schema.userProperty.name })
        .from(schema.userProperty)
        .where(
          and(
            eq(schema.userProperty.workspaceId, workspaceId),
            eq(
              schema.userProperty.resourceType,
              DBResourceTypeEnum.Declarative,
            ),
          ),
        );
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
}: DuplicateResourceRequest): Promise<
  Result<DuplicateResourceResponse, DuplicateResourceError>
> {
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
          return err({
            type: DuplicateResourceErrorType.ResourceNotFound,
            message: `Segment ${name} not found in workspace`,
          });
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
          return err({
            type: DuplicateResourceErrorType.ResourceNotFound,
            message: "Failed to duplicate segment",
          });
        }
        return ok(newSegment);
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
          return err({
            type: DuplicateResourceErrorType.ResourceNotFound,
            message: `Message template ${name} not found in workspace`,
          });
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
          return err({
            type: DuplicateResourceErrorType.ResourceNotFound,
            message: "Failed to duplicate message template",
          });
        }
        return ok(newTemplate);
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
          return err({
            type: DuplicateResourceErrorType.ResourceNotFound,
            message: `Journey ${name} not found in workspace`,
          });
        }
        const duplicateName = buildDuplicateName(name, existingNames);
        const inserted = await tx
          .insert(schema.journey)
          .values({
            workspaceId: original.workspaceId,
            name: duplicateName,
            definition: original.definition,
            canRunMultiple: original.canRunMultiple,
            resourceType: original.resourceType,
          })
          .returning({
            id: schema.journey.id,
            name: schema.journey.name,
          });
        const newJourney = inserted[0];
        if (!newJourney) {
          return err({
            type: DuplicateResourceErrorType.ResourceNotFound,
            message: "Failed to duplicate journey",
          });
        }
        return ok(newJourney);
      }
      case DuplicateResourceTypeEnum.Broadcast: {
        const original = await tx.query.broadcast.findFirst({
          where: and(
            eq(schema.broadcast.workspaceId, workspaceId),
            eq(schema.broadcast.name, name),
          ),
        });
        if (!original) {
          return err({
            type: DuplicateResourceErrorType.ResourceNotFound,
            message: `Broadcast ${name} not found in workspace`,
          });
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
          return err({
            type: DuplicateResourceErrorType.ResourceNotFound,
            message: "Failed to duplicate broadcast",
          });
        }
        return ok(newBroadcast);
      }
      case DuplicateResourceTypeEnum.UserProperty: {
        if (protectedUserProperties.has(name)) {
          return err({
            type: DuplicateResourceErrorType.ProtectedResource,
            message: `Cannot duplicate protected user property: ${name}`,
          });
        }
        const original = await tx.query.userProperty.findFirst({
          where: and(
            eq(schema.userProperty.workspaceId, workspaceId),
            eq(schema.userProperty.name, name),
            eq(
              schema.userProperty.resourceType,
              DBResourceTypeEnum.Declarative,
            ),
          ),
        });
        if (!original) {
          return err({
            type: DuplicateResourceErrorType.ResourceNotFound,
            message: `User property ${name} not found in workspace`,
          });
        }
        const duplicateName = buildDuplicateName(name, existingNames);
        const inserted = await tx
          .insert(schema.userProperty)
          .values({
            workspaceId: original.workspaceId,
            name: duplicateName,
            definition: original.definition,
            resourceType: original.resourceType,
            status: original.status,
            exampleValue: original.exampleValue,
          })
          .returning({
            id: schema.userProperty.id,
            name: schema.userProperty.name,
          });
        const newUserProperty = inserted[0];
        if (!newUserProperty) {
          return err({
            type: DuplicateResourceErrorType.ResourceNotFound,
            message: "Failed to duplicate user property",
          });
        }
        return ok(newUserProperty);
      }
      default: {
        return err({
          type: DuplicateResourceErrorType.ResourceNotFound,
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          message: `Unsupported resource type ${resourceType}`,
        });
      }
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
    null | Promise<{ id: string; name: string; definition: unknown }[]>,
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
            definition: true,
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
    response.messageTemplates = messageTemplates.map((messageTemplate) => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const definition = messageTemplate.definition as
        | { type?: ChannelType }
        | null
        | undefined;
      return {
        id: messageTemplate.id,
        name: messageTemplate.name,
        channel: definition?.type,
      };
    });
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
