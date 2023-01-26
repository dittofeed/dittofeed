import { Journey } from "@prisma/client";
import { ValueError } from "@sinclair/typebox/errors";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import prisma from "../prisma";
import {
  EnrichedJourney,
  JourneyBodyNode,
  JourneyDefinition,
  JourneyNodeType,
  JourneyResource,
} from "../types";

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

function nodeToSegment(node: JourneyBodyNode): string | null {
  switch (node.type) {
    case JourneyNodeType.SegmentSplitNode: {
      return node.variant.segment;
    }
    case JourneyNodeType.ExperimentSplitNode:
      return null;
    case JourneyNodeType.RateLimitNode:
      return null;
    case JourneyNodeType.MessageNode:
      return null;
    case JourneyNodeType.DelayNode:
      return null;
  }
}

export function getSubscribedSegments(
  definition: JourneyDefinition
): Set<string> {
  const subscribedSegments = new Set<string>();
  subscribedSegments.add(definition.entryNode.segment);
  for (const node of definition.nodes) {
    const segment = nodeToSegment(node);
    if (segment) {
      subscribedSegments.add(segment);
    }
  }
  return subscribedSegments;
}

type FindManyParams = Parameters<typeof prisma.journey.findMany>[0];

export async function findManyJourneys(
  params: FindManyParams
): Promise<Result<EnrichedJourney[], ValueError[]>> {
  const journeys = await prisma.journey.findMany(params);

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
