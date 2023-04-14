import { Row } from "@clickhouse/client";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import { clickhouseClient, ClickHouseQueryBuilder } from "../../../clickhouse";
import { getSubscribedSegments } from "../../../journeys";
import {
  segmentUpdateSignal,
  userJourneyWorkflow,
} from "../../../journeys/userWorkflow";
import logger from "../../../logger";
import prisma, { Prisma } from "../../../prisma";
import { findAllEnrichedSegments } from "../../../segments";
import { getContext } from "../../../temporal/activity";
import {
  ComputedAssignment,
  ComputedPropertyAssignment,
  EnrichedJourney,
  EnrichedUserProperty,
  SegmentUpdate,
} from "../../../types";
import { insertProcessedComputedProperties } from "../../../userEvents/clickhouse";
import writeAssignments from "./computeProperties/writeAssignments";

async function signalJourney({
  segmentId,
  workspaceId,
  segmentAssignment,
  journey,
}: {
  segmentId: string;
  workspaceId: string;
  segmentAssignment: ComputedAssignment;
  journey: EnrichedJourney;
}) {
  const segmentUpdate = {
    segmentId,
    currentlyInSegment: Boolean(segmentAssignment.latest_segment_value),
    segmentVersion: new Date(segmentAssignment.max_assigned_at).getTime(),
  };

  if (!segmentUpdate.currentlyInSegment) {
    logger().debug(segmentUpdate, "not signalling for false segment");
    return;
  }

  const { workflowClient } = getContext();
  const workflowId = `user-journey-${journey.id}-${segmentAssignment.user_id}`;

  const userId = segmentAssignment.user_id;
  await workflowClient.signalWithStart<
    typeof userJourneyWorkflow,
    [SegmentUpdate]
  >(userJourneyWorkflow, {
    taskQueue: "default",
    workflowId,
    args: [
      {
        journeyId: journey.id,
        definition: journey.definition,
        workspaceId,
        userId,
      },
    ],
    signal: segmentUpdateSignal,
    signalArgs: [segmentUpdate],
  });
}

// TODO distinguish between recoverable and non recoverable errors
// TODO signal back to workflow with query id, so that query can be safely restarted part way through
export async function computePropertiesPeriodSafe({
  currentTime,
  subscribedJourneys,
  tableVersion,
  workspaceId,
  userProperties,
}: ComputePropertiesPeriodParams): Promise<Result<null, Error>> {
  const segmentResult = await findAllEnrichedSegments(workspaceId);

  if (segmentResult.isErr()) {
    return err(new Error(JSON.stringify(segmentResult.error)));
  }

  await writeAssignments({
    currentTime,
    segments: segmentResult.value,
    tableVersion,
    userProperties,
    workspaceId,
  });

  // segment id / pg + journey id
  const subscribedSegmentPairs = subscribedJourneys.reduce<
    Map<string, Set<string>>
  >((memo, j) => {
    const subscribedSegments = getSubscribedSegments(j.definition);

    subscribedSegments.forEach((segmentId) => {
      const processFor = memo.get(segmentId) ?? new Set();
      processFor.add(j.id);
      memo.set(segmentId, processFor);
    });
    return memo;
  }, new Map());

  const readChqb = new ClickHouseQueryBuilder();

  const subscribedSegmentKeys: string[] = [];
  const subscribedSegmentValues: string[][] = [];

  for (const [segmentId, journeySet] of Array.from(subscribedSegmentPairs)) {
    subscribedSegmentKeys.push(segmentId);
    subscribedSegmentValues.push(Array.from(journeySet));
  }

  const subscribedSegmentKeysQuery = readChqb.addQueryValue(
    subscribedSegmentKeys,
    "Array(String)"
  );

  const subscribedSegmentValuesQuery = readChqb.addQueryValue(
    subscribedSegmentValues,
    "Array(Array(String))"
  );

  const readQuery = `
    SELECT
      cpa.workspace_id,
      cpa.type,
      cpa.computed_property_id,
      cpa.user_id,
      cpa.latest_segment_value,
      cpa.latest_user_property_value,
      cpa.max_assigned_at,
      cpa.processed_for
    FROM (
      SELECT workspace_id,
          type,
          computed_property_id,
          user_id,
          segment_value latest_segment_value,
          user_property_value latest_user_property_value,
          assigned_at max_assigned_at,
          arrayJoin(
              arrayConcat(
                  if(
                      type = 'segment' AND indexOf(${subscribedSegmentKeysQuery}, computed_property_id) > 0,
                      arrayElement(${subscribedSegmentValuesQuery}, indexOf(${subscribedSegmentKeysQuery}, computed_property_id)),
                      []
                  ),
                  ['pg']
              )
          ) as processed_for
      FROM computed_property_assignments FINAL
    ) cpa
    WHERE (
      workspace_id,
      computed_property_id,
      user_id,
      latest_segment_value,
      latest_user_property_value,
      processed_for
    ) NOT IN (
      SELECT
        workspace_id,
        computed_property_id,
        user_id,
        segment_value,
        user_property_value,
        processed_for
      FROM processed_computed_properties FINAL
    )
  `;

  logger().debug(
    {
      workspaceId,
      queryParams: readChqb.getQueries(),
      query: readQuery,
    },
    "compute properties read query"
  );

  const resultSet = await clickhouseClient().query({
    query: readQuery,
    query_params: readChqb.getQueries(),
    format: "JSONEachRow",
  });

  for await (const rows of resultSet.stream()) {
    const assignments: ComputedAssignment[] = await Promise.all(
      rows.flatMap(async (row: Row) => {
        const json = await row.json();
        const result = schemaValidate(json, ComputedAssignment);
        if (result.isErr()) {
          logger().error(
            { err: result.error, json },
            "failed to parse assignment json"
          );
          return [];
        }
        return result.value;
      })
    );

    const pgUserPropertyAssignments: ComputedAssignment[] = [];
    const pgSegmentAssignments: ComputedAssignment[] = [];
    const signalSegmentAssignments: ComputedAssignment[] = [];

    for (const assignment of assignments) {
      let assignmentCategory: ComputedAssignment[];
      if (assignment.processed_for === "pg") {
        switch (assignment.type) {
          case "segment":
            assignmentCategory = pgSegmentAssignments;
            break;
          case "user_property":
            assignmentCategory = pgUserPropertyAssignments;
            break;
        }
      } else {
        assignmentCategory = signalSegmentAssignments;
      }
      assignmentCategory.push(assignment);
    }

    logger().debug(
      {
        workspaceId,
        assignmentsCount: assignments.length,
        pgUserPropertyAssignmentsCount: pgUserPropertyAssignments.length,
        pgSegmentAssignmentsCount: pgSegmentAssignments.length,
        signalSegmentAssignmentsCount: signalSegmentAssignments.length,
      },
      "processing computed assignments"
    );

    await Promise.all([
      ...pgUserPropertyAssignments.map(async (a) => {
        try {
          await prisma().userPropertyAssignment.upsert({
            where: {
              workspaceId_userPropertyId_userId: {
                workspaceId,
                userId: a.user_id,
                userPropertyId: a.computed_property_id,
              },
            },
            update: {
              value: a.latest_user_property_value,
            },
            create: {
              workspaceId,
              userId: a.user_id,
              userPropertyId: a.computed_property_id,
              value: a.latest_user_property_value,
            },
          });
        } catch (e) {
          // If reference error due to user assignment not existing anymore, swallow error and continue
          if (
            !(
              e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === "P2003"
            )
          ) {
            throw e;
          }
        }
      }),
      ...pgSegmentAssignments.map(async (a) => {
        const inSegment = Boolean(a.latest_segment_value);
        try {
          await prisma().segmentAssignment.upsert({
            where: {
              workspaceId_userId_segmentId: {
                workspaceId,
                userId: a.user_id,
                segmentId: a.computed_property_id,
              },
            },
            update: {
              inSegment,
            },
            create: {
              workspaceId,
              userId: a.user_id,
              segmentId: a.computed_property_id,
              inSegment,
            },
          });
        } catch (e) {
          // If reference error due to segment not existing anymore, swallow error and continue
          if (
            !(
              e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === "P2003"
            )
          ) {
            throw e;
          }
        }
      }),
    ]);

    await Promise.all(
      signalSegmentAssignments.flatMap((assignment) => {
        const journey = subscribedJourneys.find(
          (j) => j.id === assignment.processed_for
        );
        if (!journey) {
          logger().error(
            {
              subscribedJourneys: subscribedJourneys.map((j) => j.id),
              processed_for: assignment.processed_for,
            },
            "journey in assignment.processed_for missing from subscribed journeys"
          );
          return [];
        }

        return signalJourney({
          workspaceId,
          segmentId: assignment.computed_property_id,
          segmentAssignment: assignment,
          journey,
        });
      })
    );

    const processedAssignments: ComputedPropertyAssignment[] =
      assignments.flatMap((assignment) => ({
        workspace_id: workspaceId,
        user_property_value: assignment.latest_user_property_value,
        segment_value: assignment.latest_segment_value,
        ...assignment,
      }));

    await insertProcessedComputedProperties({
      assignments: processedAssignments,
    });
  }

  return ok(null);
}

interface ComputePropertiesPeriodParams {
  currentTime: number;
  newComputedIds?: Record<string, boolean>;
  subscribedJourneys: EnrichedJourney[];
  userProperties: EnrichedUserProperty[];
  processingTimeLowerBound?: number;
  workspaceId: string;
  tableVersion: string;
}

export async function computePropertiesPeriod(
  params: ComputePropertiesPeriodParams
): Promise<null> {
  try {
    return unwrap(await computePropertiesPeriodSafe(params));
  } catch (e) {
    logger().error(
      { err: e, workspaceId: params.workspaceId },
      "failed to compute properties"
    );
    throw e;
  }
}
