import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import prisma from "./prisma";
import {
  EnrichedIntegration,
  Integration,
  IntegrationDefinition,
  IntegrationResource,
  UpsertIntegrationResource,
} from "./types";
import { pick } from "remeda";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

export function enrichIntegration(
  integration: Integration
): Result<EnrichedIntegration, Error> {
  const definitionResult = schemaValidateWithErr(
    integration.definition,
    IntegrationDefinition
  );
  if (definitionResult.isErr()) {
    return err(definitionResult.error);
  }
  return ok({
    ...integration,
    definition: definitionResult.value,
  });
}

export async function findAllEnrichedIntegrations(
  workspaceId: string
): Promise<Result<EnrichedIntegration[], Error>> {
  const dbVals = await prisma().integration.findMany({
    where: { workspaceId },
  });

  const enriched: EnrichedIntegration[] = [];
  for (const val of dbVals) {
    const definitionResult = schemaValidateWithErr(
      val.definition,
      IntegrationDefinition
    );
    if (definitionResult.isErr()) {
      return err(definitionResult.error);
    }
    enriched.push({
      ...val,
      definition: definitionResult.value,
    });
  }
  return ok(enriched);
}

export async function upsertIntegration({
  name,
  workspaceId,
  definition,
  enabled,
}: UpsertIntegrationResource): Promise<IntegrationResource> {
  let integration: Integration;
  if (definition) {
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
      },
      update: {
        definition,
        enabled,
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
