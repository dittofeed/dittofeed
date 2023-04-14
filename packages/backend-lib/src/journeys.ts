import { Journey, PrismaClient } from "@prisma/client";
import { ValueError } from "@sinclair/typebox/errors";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import prisma from "./prisma";
import { EnrichedJourney, JourneyDefinition, JourneyResource } from "./types";

export * from "isomorphic-lib/src/journeys";

export function enrichJourney(
  journey: Journey
): Result<EnrichedJourney, ValueError[]> {
  const definitionResult = schemaValidate(
    journey.definition,
    JourneyDefinition
  );
  if (definitionResult.isErr()) {
    return err(definitionResult.error);
  }
  return ok({
    ...journey,
    definition: definitionResult.value,
  });
}

type FindManyParams = Parameters<PrismaClient["journey"]["findMany"]>[0];

export async function findManyJourneys(
  params: FindManyParams
): Promise<Result<EnrichedJourney[], ValueError[]>> {
  const journeys = await prisma().journey.findMany(params);

  const subscribedJourneys: EnrichedJourney[] = [];

  for (const journey of journeys) {
    const enrichedJourney = enrichJourney(journey);

    if (enrichedJourney.isErr()) {
      return err(enrichedJourney.error);
    }

    subscribedJourneys.push(enrichedJourney.value);
  }

  return ok(subscribedJourneys);
}

export function toJourneyResource(
  journey: Journey
): Result<JourneyResource, ValueError[]> {
  const result = enrichJourney(journey);
  if (result.isErr()) {
    return err(result.error);
  }
  const { id, name, workspaceId, definition, status } = result.value;
  return ok({
    id,
    name,
    workspaceId,
    status,
    definition,
  });
}

// TODO don't use this method for activities. Don't want to retry failures typically.
export async function findManyJourneysUnsafe(
  params: FindManyParams
): Promise<EnrichedJourney[]> {
  const result = await findManyJourneys(params);
  return unwrap(result);
}
