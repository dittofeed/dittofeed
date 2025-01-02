import { and, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";
import { pick } from "remeda";

import { db } from "./db";
import { integration as dbIntegration } from "./db/schema";
import {
  EnrichedIntegration,
  Integration,
  IntegrationDefinition,
  IntegrationResource,
  SavedIntegrationResource,
  UpsertIntegrationResource,
} from "./types";

export function enrichIntegration(
  integration: Integration,
): Result<EnrichedIntegration, Error> {
  const definitionResult = schemaValidateWithErr(
    integration.definition,
    IntegrationDefinition,
  );
  if (definitionResult.isErr()) {
    return err(definitionResult.error);
  }
  return ok({
    ...integration,
    definition: definitionResult.value,
  });
}

function toIntegrationResource(
  integration: Integration,
): Result<SavedIntegrationResource, Error> {
  return enrichIntegration(integration).map((i) => ({
    workspaceId: i.workspaceId,
    name: i.name,
    id: i.id,
    definition: i.definition,
    enabled: i.enabled,
    createdAt: new Date(i.createdAt).getTime(),
    updatedAt: new Date(i.updatedAt).getTime(),
    definitionUpdatedAt: new Date(i.definitionUpdatedAt).getTime(),
  }));
}

export async function findAllEnrichedIntegrations(
  workspaceId: string,
): Promise<Result<EnrichedIntegration[], Error>> {
  const dbVals = await db().query.integration.findMany({
    where: and(
      eq(dbIntegration.workspaceId, workspaceId),
      eq(dbIntegration.enabled, true),
    ),
  });

  const enriched: EnrichedIntegration[] = [];
  for (const val of dbVals) {
    const integrationResult = enrichIntegration(val);
    if (integrationResult.isErr()) {
      return err(integrationResult.error);
    }
    enriched.push(integrationResult.value);
  }
  return ok(enriched);
}

export async function findAllIntegrationResources({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<SavedIntegrationResource, Error>[]> {
  const dbVals = await db().query.integration.findMany({
    where: and(
      eq(dbIntegration.workspaceId, workspaceId),
      eq(dbIntegration.enabled, true),
    ),
  });
  return dbVals.map(toIntegrationResource);
}

export async function findEnrichedIntegration({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}): Promise<Result<EnrichedIntegration | null, Error>> {
  const integration = await db().query.integration.findFirst({
    where: and(
      eq(dbIntegration.workspaceId, workspaceId),
      eq(dbIntegration.name, name),
    ),
  });
  if (!integration) {
    return ok(null);
  }
  return enrichIntegration(integration);
}

export async function upsertIntegration({
  name,
  workspaceId,
  definition,
  enabled,
}: UpsertIntegrationResource): Promise<IntegrationResource> {
  let integration: Integration;
  if (definition) {
    const now = new Date();
    integration = await prisma().integration.upsert({
      where: {
        workspaceId_name: {
          name,
          workspaceId,
        },
      },
      create: {
        name,
        workspaceId,
        definition,
        enabled,
        definitionUpdatedAt: now,
      },
      update: {
        definition,
        enabled,
        definitionUpdatedAt: now,
      },
    });
  } else {
    integration = await prisma().integration.update({
      where: {
        workspaceId_name: {
          name,
          workspaceId,
        },
      },
      data: {
        enabled,
      },
    });
  }
  const enriched = unwrap(enrichIntegration(integration));
  return pick(enriched, ["id", "name", "workspaceId", "definition", "enabled"]);
}
