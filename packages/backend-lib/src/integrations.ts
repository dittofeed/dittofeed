import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import prisma from "./prisma";
import { EnrichedIntegration, IntegrationDefinition } from "./types";

// TODO return list of results instead of result of list
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
