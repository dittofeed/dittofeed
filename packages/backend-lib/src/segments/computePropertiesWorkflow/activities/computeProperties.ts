/* eslint-disable no-await-in-loop */
import { Row } from "@clickhouse/client";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import { clickhouseClient, ClickHouseQueryBuilder } from "../../../clickhouse";
import { HUBSPOT_INTEGRATION } from "../../../constants";
import { findAllEnrichedIntegrations } from "../../../integrations";
import { startHubspotUserIntegrationWorkflow } from "../../../integrations/hubspot/signalUtils";
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
  ComputedPropertyUpdate,
  EnrichedJourney,
  EnrichedUserProperty,
  SegmentUpdate,
} from "../../../types";
import { insertProcessedComputedProperties } from "../../../userEvents/clickhouse";
import writeAssignments from "./computeProperties/writeAssignments";

const READ_QUERY_PAGE_SIZE = 200;

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
  const segmentUpdate: SegmentUpdate = {
    segmentId,
    currentlyInSegment: Boolean(segmentAssignment.latest_segment_value),
    segmentVersion: new Date(segmentAssignment.max_assigned_at).getTime(),
    type: "segment",
  };

  if (!segmentUpdate.currentlyInSegment) {
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

interface ComputePropertiesPeriodParams {
  currentTime: number;
  newComputedIds?: Record<string, boolean>;
  subscribedJourneys: EnrichedJourney[];
  userProperties: EnrichedUserProperty[];
  processingTimeLowerBound?: number;
  workspaceId: string;
  tableVersion: string;
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
  const [segmentResult, integrationsResult] = await Promise.all([
    findAllEnrichedSegments(workspaceId),
    findAllEnrichedIntegrations(workspaceId),
  ]);

  if (segmentResult.isErr()) {
    return err(new Error(JSON.stringify(segmentResult.error)));
  }

  if (integrationsResult.isErr()) {
    return err(integrationsResult.error);
  }

  await writeAssignments({
    currentTime,
    segments: segmentResult.value,
    tableVersion,
    userProperties,
    workspaceId,
  });

  // segment id / pg + journey id
  const subscribedJourneyMap = subscribedJourneys.reduce<
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

  const subscribedIntegrationUserPropertyMap = integrationsResult.value.reduce<
    Map<string, Set<string>>
  >((memo, integration) => {
    integration.definition.subscribedUserProperties.forEach(
      (userPropertyName) => {
        const userPropertyId = userProperties.find(
          (up) => up.name === userPropertyName
        )?.id;
        if (!userPropertyId) {
          logger().info(
            { workspaceId, integration, userPropertyName },
            "integration subscribed to user property that doesn't exist"
          );
          return;
        }
        const processFor = memo.get(userPropertyId) ?? new Set();
        processFor.add(integration.name);
        memo.set(userPropertyId, processFor);
      }
    );
    return memo;
  }, new Map());

  const subscribedIntegrationSegmentMap = integrationsResult.value.reduce<
    Map<string, Set<string>>
  >((memo, integration) => {
    integration.definition.subscribedSegments.forEach((segmentName) => {
      const segmentId = segmentResult.value.find(
        (s) => s.name === segmentName
      )?.id;
      if (!segmentId) {
        logger().info(
          { workspaceId, integration, segmentName },
          "integration subscribed to user property that doesn't exist"
        );
        return;
      }
      const processFor = memo.get(segmentId) ?? new Set();
      processFor.add(integration.name);
      memo.set(segmentId, processFor);
    });
    return memo;
  }, new Map());

  const readChqb = new ClickHouseQueryBuilder();
  const subscribedJourneyKeys: string[] = [];
  const subscribedJourneyValues: string[][] = [];
  const subscribedIntegrationUserPropertyKeys: string[] = [];
  const subscribedIntegrationUserPropertyValues: string[][] = [];
  const subscribedIntegrationSegmentKeys: string[] = [];
  const subscribedIntegrationSegmentValues: string[][] = [];

  for (const [segmentId, journeySet] of Array.from(subscribedJourneyMap)) {
    subscribedJourneyKeys.push(segmentId);
    subscribedJourneyValues.push(Array.from(journeySet));
  }

  for (const [segmentId, integrationSet] of Array.from(
    subscribedIntegrationSegmentMap
  )) {
    subscribedIntegrationSegmentKeys.push(segmentId);
    subscribedIntegrationSegmentValues.push(Array.from(integrationSet));
  }

  for (const [userPropertyId, integrationSet] of Array.from(
    subscribedIntegrationUserPropertyMap
  )) {
    subscribedIntegrationUserPropertyKeys.push(userPropertyId);
    subscribedIntegrationUserPropertyValues.push(Array.from(integrationSet));
  }

  const subscribedJourneysKeysQuery = readChqb.addQueryValue(
    subscribedJourneyKeys,
    "Array(String)"
  );

  const subscribedJourneysValuesQuery = readChqb.addQueryValue(
    subscribedJourneyValues,
    "Array(Array(String))"
  );

  const subscribedIntegrationsUserPropertyKeysQuery = readChqb.addQueryValue(
    subscribedIntegrationUserPropertyKeys,
    "Array(String)"
  );

  const subscribedIntegrationsUserPropertyValuesQuery = readChqb.addQueryValue(
    subscribedIntegrationUserPropertyValues,
    "Array(Array(String))"
  );

  const subscribedIntegrationsSegmentKeysQuery = readChqb.addQueryValue(
    subscribedIntegrationSegmentKeys,
    "Array(String)"
  );

  const subscribedIntegrationsSegmentValuesQuery = readChqb.addQueryValue(
    subscribedIntegrationSegmentValues,
    "Array(Array(String))"
  );

  const workspaceIdParam = readChqb.addQueryValue(workspaceId, "String");

  // FIXME add segments integrations
  // FIXME refactor out
  // FIXME only send effects for computed properties that have changed and are not empty. case where user was in segment, and now is not, should send signal to workflow to remove user from integration but currenlty does not
  //  check not only if value is in processed, but if any value is in
  const readQuery = `
    SELECT
      cpa.workspace_id,
      cpa.type,
      cpa.computed_property_id,
      cpa.user_id,
      cpa.latest_segment_value,
      cpa.latest_user_property_value,
      cpa.max_assigned_at,
      cpa.processed_for,
      cpa.processed_for_type,
      pcp.workspace_id
    FROM (
      SELECT
          workspace_id,
          type,
          computed_property_id,
          user_id,
          segment_value latest_segment_value,
          user_property_value latest_user_property_value,
          assigned_at max_assigned_at,
          arrayJoin(
              arrayConcat(
                  if(
                      type = 'segment' AND indexOf(${subscribedJourneysKeysQuery}, computed_property_id) > 0,
                      arrayMap(i -> ('journey', i), arrayElement(${subscribedJourneysValuesQuery}, indexOf(${subscribedJourneysKeysQuery}, computed_property_id))),
                      []
                  ),
                  if(
                      type = 'user_property' AND indexOf(${subscribedIntegrationsUserPropertyKeysQuery}, computed_property_id) > 0,
                      arrayMap(i -> ('integration', i), arrayElement(${subscribedIntegrationsUserPropertyValuesQuery}, indexOf(${subscribedIntegrationsUserPropertyKeysQuery}, computed_property_id))),
                      []
                  ),
                  if(
                      type = 'segment' AND indexOf(${subscribedIntegrationsSegmentKeysQuery}, computed_property_id) > 0,
                      arrayMap(i -> ('integration', i), arrayElement(${subscribedIntegrationsSegmentValuesQuery}, indexOf(${subscribedIntegrationsSegmentKeysQuery}, computed_property_id))),
                      []
                  ),
                  [('pg', 'pg')]
              )
          ) as processed,
          processed.1 as processed_for_type,
          processed.2 as processed_for
      FROM computed_property_assignments FINAL
      WHERE workspace_id = ${workspaceIdParam}
      AND processed_for_type = 'pg'
      OR (
        latest_segment_value = True
        OR (
          latest_user_property_value IS NOT NULL
          AND latest_user_property_value != '""'
        )
      )
    ) cpa
    LEFT JOIN processed_computed_properties pcp FINAL
    ON
      cpa.workspace_id = pcp.workspace_id AND
      cpa.computed_property_id = pcp.computed_property_id AND
      cpa.user_id = pcp.user_id AND
      cpa.latest_segment_value = pcp.segment_value AND
      cpa.latest_user_property_value = pcp.user_property_value AND
      cpa.processed_for = pcp.processed_for
    WHERE pcp.workspace_id = ''
  `;

  let offset = 0;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    const paginatedReadQuery = `${readQuery} LIMIT ${READ_QUERY_PAGE_SIZE} OFFSET ${offset}`;

    const resultSet = await clickhouseClient().query({
      query: paginatedReadQuery,
      query_params: readChqb.getQueries(),
      format: "JSONEachRow",
    });

    let hasRows = false;
    for await (const rows of resultSet.stream()) {
      const assignments: ComputedAssignment[] = await Promise.all(
        rows.flatMap(async (row: Row) => {
          const json = await row.json();
          logger().debug({ json }, "processing assignment json");
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
      const journeySegmentAssignments: ComputedAssignment[] = [];
      const integrationAssignments: ComputedAssignment[] = [];

      for (const assignment of assignments) {
        hasRows = true;

        let assignmentCategory: ComputedAssignment[];
        if (assignment.processed_for_type === "pg") {
          switch (assignment.type) {
            case "segment":
              assignmentCategory = pgSegmentAssignments;
              break;
            case "user_property":
              assignmentCategory = pgUserPropertyAssignments;
              break;
          }
        } else if (assignment.processed_for_type === "integration") {
          assignmentCategory = integrationAssignments;
        } else {
          assignmentCategory = journeySegmentAssignments;
        }
        assignmentCategory.push(assignment);
      }

      logger().debug(
        {
          workspaceId,
          assignmentsCount: assignments.length,
          pgUserPropertyAssignmentsCount: pgUserPropertyAssignments.length,
          pgSegmentAssignmentsCount: pgSegmentAssignments.length,
          journeySegmentAssignmentsCount: journeySegmentAssignments.length,
          integrationSegmentAssignmentsCount: integrationAssignments.length,
        },
        "processing computed assignments"
      );

      await Promise.all([
        ...pgUserPropertyAssignments.map(async (a) => {
          try {
            await prisma().userPropertyAssignment.upsert({
              where: {
                workspaceId_userPropertyId_userId: {
                  workspaceId: a.workspace_id,
                  userId: a.user_id,
                  userPropertyId: a.computed_property_id,
                },
              },
              update: {
                value: a.latest_user_property_value,
              },
              create: {
                workspaceId: a.workspace_id,
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
                  workspaceId: a.workspace_id,
                  userId: a.user_id,
                  segmentId: a.computed_property_id,
                },
              },
              update: {
                inSegment,
              },
              create: {
                workspaceId: a.workspace_id,
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

      await Promise.all([
        ...journeySegmentAssignments.flatMap((assignment) => {
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
        }),
        ...integrationAssignments.flatMap(async (assignment) => {
          switch (assignment.processed_for) {
            case HUBSPOT_INTEGRATION: {
              const { workflowClient } = getContext();
              const updateVersion = new Date(
                assignment.max_assigned_at
              ).getTime();

              const update: ComputedPropertyUpdate =
                assignment.type === "segment"
                  ? {
                      type: "segment",
                      segmentId: assignment.computed_property_id,
                      segmentVersion: updateVersion,
                      currentlyInSegment: assignment.latest_segment_value,
                    }
                  : {
                      type: "user_property",
                      userPropertyId: assignment.computed_property_id,
                      value: assignment.latest_user_property_value,
                      userPropertyVersion: updateVersion,
                    };

              return startHubspotUserIntegrationWorkflow({
                workspaceId: assignment.workspace_id,
                userId: assignment.user_id,
                workflowClient,
                update,
              });
            }
            default:
              logger().error(
                {
                  workspaceId,
                  assignment,
                },
                "integration in assignment.processed_for missing from subscribed integrations"
              );
              return [];
          }
        }),
      ]);

      const processedAssignments: ComputedPropertyAssignment[] =
        assignments.flatMap((assignment) => ({
          user_property_value: assignment.latest_user_property_value,
          segment_value: assignment.latest_segment_value,
          ...assignment,
        }));

      await insertProcessedComputedProperties({
        assignments: processedAssignments,
      });
    }

    // If no rows were fetched in this iteration, break out of the loop.
    if (!hasRows) {
      break;
    }

    // Increment the offset by PAGE_SIZE to fetch the next set of rows in the next iteration.
    offset += READ_QUERY_PAGE_SIZE;
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
