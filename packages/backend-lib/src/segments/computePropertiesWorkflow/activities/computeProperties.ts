/* eslint-disable no-await-in-loop */
import { randomUUID } from "node:crypto";

import { Row } from "@clickhouse/client";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";
import pLimit from "p-limit";

import {
  ClickHouseQueryBuilder,
  createClickhouseClient,
  getChCompatibleUuid,
} from "../../../clickhouse";
import config from "../../../config";
import { HUBSPOT_INTEGRATION } from "../../../constants";
import { findAllEnrichedIntegrations } from "../../../integrations";
import { startHubspotUserIntegrationWorkflow } from "../../../integrations/hubspot/signalUtils";
import { getSubscribedSegments } from "../../../journeys";
import {
  segmentUpdateSignal,
  userJourneyWorkflow,
} from "../../../journeys/userWorkflow";
import logger from "../../../logger";
import {
  findManyEnrichedSegments,
  upsertBulkSegmentAssignments,
} from "../../../segments";
import { getContext } from "../../../temporal/activity";
import {
  ComputedAssignment,
  ComputedPropertyAssignment,
  ComputedPropertyUpdate,
  EnrichedIntegration,
  EnrichedJourney,
  EnrichedSegment,
  EnrichedUserProperty,
  SegmentUpdate,
} from "../../../types";
import { insertProcessedComputedProperties } from "../../../userEvents/clickhouse";
import { upsertBulkUserPropertyAssignments } from "../../../userProperties";
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
  subscribedJourneys: EnrichedJourney[];
  userProperties: EnrichedUserProperty[];
  workspaceId: string;
  tableVersion: string;
}

function buildReadQuery({
  workspaceId,
  subscribedJourneys,
  integrations,
  userProperties,
  segments,
  queryBuilder: readChqb,
}: {
  queryBuilder: ClickHouseQueryBuilder;
  workspaceId: string;
  subscribedJourneys: EnrichedJourney[];
  integrations: EnrichedIntegration[];
  userProperties: EnrichedUserProperty[];
  segments: EnrichedSegment[];
}): {
  query: string;
  tmpTableName: string;
} {
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

  const subscribedIntegrationUserPropertyMap = integrations.reduce<
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

  const subscribedIntegrationSegmentMap = integrations.reduce<
    Map<string, Set<string>>
  >((memo, integration) => {
    integration.definition.subscribedSegments.forEach((segmentName) => {
      const segmentId = segments.find((s) => s.name === segmentName)?.id;
      if (!segmentId) {
        logger().info(
          { workspaceId, integration, segmentName },
          "integration subscribed to segment that doesn't exist"
        );
        return;
      }
      const processFor = memo.get(segmentId) ?? new Set();
      processFor.add(integration.name);
      memo.set(segmentId, processFor);
    });
    return memo;
  }, new Map());

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

  const tmpTableName = `computed_properties_to_process_${getChCompatibleUuid()}`;
  const { clickhouseDatabase } = config();

  /**
   * This query is a bit complicated, so here's a breakdown of what it does:
   *
   * 1. It reads all the computed property assignments for the workspace.
   * 2. It joins the computed property assignments with the processed computed
   * properties table to filter out assignments that have already been
   * processed.
   * 3. It filters out "empty assignments" (assignments where the user property
   * value is empty, or the segment value is false) if the property has not
   * already been assigned.
   * 4. It filters out false segment assignments to journeys.
   */
  const query = `
    CREATE TEMPORARY TABLE IF NOT EXISTS ${tmpTableName} AS
    SELECT
      cpa.workspace_id,
      cpa.type,
      cpa.computed_property_id,
      cpa.user_id,
      cpa.latest_segment_value,
      cpa.latest_user_property_value,
      cpa.max_assigned_at,
      cpa.processed_for,
      cpa.processed_for_type
    FROM (
      SELECT
          workspace_id,
          type,
          computed_property_id,
          user_id,
          argMax(segment_value, assigned_at) latest_segment_value,
          argMax(user_property_value, assigned_at) latest_user_property_value,
          max(assigned_at) max_assigned_at,
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
      FROM ${clickhouseDatabase}.computed_property_assignments
      WHERE workspace_id = ${workspaceIdParam}
      GROUP BY
          workspace_id,
          type,
          computed_property_id,
          user_id
    ) cpa
    LEFT JOIN (
      SELECT
        workspace_id,
        computed_property_id,
        user_id,
        processed_for_type,
        processed_for,
        argMax(segment_value, processed_at) segment_value,
        argMax(user_property_value, processed_at) user_property_value
      FROM ${clickhouseDatabase}.processed_computed_properties
      GROUP BY
        workspace_id,
        computed_property_id,
        user_id,
        processed_for_type,
        processed_for
    ) pcp
    ON
      cpa.workspace_id = pcp.workspace_id AND
      cpa.computed_property_id = pcp.computed_property_id AND
      cpa.user_id = pcp.user_id AND
      cpa.processed_for = pcp.processed_for AND
      cpa.processed_for_type = pcp.processed_for_type
    WHERE (
      cpa.latest_user_property_value != pcp.user_property_value
      OR cpa.latest_segment_value != pcp.segment_value
    )
    AND (
        (
            cpa.type = 'user_property'
            AND cpa.latest_user_property_value != '""'
            AND cpa.latest_user_property_value != ''
        )
        OR (
            cpa.type = 'segment'
            AND cpa.latest_segment_value = true
        )
        OR (
            pcp.workspace_id != ''
            AND cpa.processed_for_type != 'journey'
        )
    )
  `;

  return {
    query,
    tmpTableName,
  };
}

async function processRows({
  rows,
  workspaceId,
  subscribedJourneys,
}: {
  rows: Row[];
  workspaceId: string;
  subscribedJourneys: EnrichedJourney[];
}): Promise<boolean> {
  let hasRows = false;
  const assignments: ComputedAssignment[] = (
    await Promise.all(
      rows.map(async (row) => {
        const json = await row.json();
        const result = schemaValidateWithErr(json, ComputedAssignment);
        if (result.isErr()) {
          logger().error(
            { err: result.error, json },
            "failed to parse assignment json"
          );
          const emptyAssignments: ComputedAssignment[] = [];
          return emptyAssignments;
        }
        return result.value;
      })
    )
  ).flat();

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

  logger().info(
    {
      workspaceId,
      assignmentsCount: assignments.length,
      pgUserPropertyAssignmentsCount: pgUserPropertyAssignments.length,
      pgSegmentAssignmentsCount: pgSegmentAssignments.length,
      journeySegmentAssignmentsCount: journeySegmentAssignments.length,
      integrationAssignmentsCount: integrationAssignments.length,
    },
    "processing computed assignments"
  );

  await Promise.all([
    upsertBulkUserPropertyAssignments({
      data: pgUserPropertyAssignments.map((a) => ({
        workspaceId: a.workspace_id,
        userId: a.user_id,
        userPropertyId: a.computed_property_id,
        value: a.latest_user_property_value,
      })),
    }),
    upsertBulkSegmentAssignments({
      data: pgSegmentAssignments.map((a) => ({
        workspaceId: a.workspace_id,
        userId: a.user_id,
        segmentId: a.computed_property_id,
        inSegment: a.latest_segment_value,
      })),
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
          const updateVersion = new Date(assignment.max_assigned_at).getTime();

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
  return hasRows;
}

let LIMIT: pLimit.Limit | null = null;

function limit() {
  if (!LIMIT) {
    LIMIT = pLimit(config().readQueryConcurrency);
  }
  return LIMIT;
}

// TODO distinguish between recoverable and non recoverable errors
// TODO signal back to workflow with query id, so that query can be safely restarted part way through
export async function computePropertiesPeriodSafe({
  currentTime,
  subscribedJourneys,
  tableVersion,
  workspaceId,
  userProperties,
  segmentIds,
}: ComputePropertiesPeriodParams): Promise<Result<null, Error>> {
  const [segmentResult, integrationsResult] = await Promise.all([
    findManyEnrichedSegments({ workspaceId, segmentIds }),
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

  const readChqb = new ClickHouseQueryBuilder();
  const { query: readQuery, tmpTableName } = buildReadQuery({
    workspaceId,
    subscribedJourneys,
    integrations: integrationsResult.value,
    userProperties,
    segments: segmentResult.value,
    queryBuilder: readChqb,
  });

  const clickhouseClient = createClickhouseClient({
    enableSession: true,
  });

  const { readQueryPageSize } = config();

  try {
    const tmpTableQueryId = randomUUID();
    try {
      await clickhouseClient.command({
        query: readQuery,
        query_params: readChqb.getQueries(),
        query_id: tmpTableQueryId,
      });
    } catch (e) {
      logger().error(
        {
          workspaceId,
          queryId: tmpTableQueryId,
          err: e,
        },
        "failed read temp table"
      );
      throw e;
    }
    logger().info(
      {
        workspaceId,
        queryId: tmpTableQueryId,
      },
      "read query temp table"
    );
    let offset = 0;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
      const paginatedReadQuery = `SELECT * FROM ${tmpTableName} LIMIT ${readQueryPageSize} OFFSET ${offset}`;

      let resultSet: Awaited<ReturnType<(typeof clickhouseClient)["query"]>>;
      const pageQueryId = randomUUID();
      try {
        resultSet = await limit()(() =>
          clickhouseClient.query({
            query: paginatedReadQuery,
            query_id: pageQueryId,
            format: "JSONEachRow",
          })
        );
      } catch (e) {
        logger().error(
          {
            workspaceId,
            queryId: pageQueryId,
            err: e,
            readQueryPageSize,
            offset,
          },
          "failed read query page"
        );
        throw e;
      }
      logger().info(
        {
          workspaceId,
          queryId: pageQueryId,
          readQueryPageSize,
          offset,
        },
        "read query page"
      );

      let unprocessedRowSets = 0;
      let receivedRows = 0;
      let hasEnded = false;
      let hasFailed = false;
      const stream = resultSet.stream();

      try {
        await new Promise((resolve, reject) => {
          stream.on("data", (rows: Row[]) => {
            if (hasFailed) {
              return;
            }
            receivedRows += rows.length;

            (async () => {
              unprocessedRowSets += 1;
              try {
                await processRows({ rows, workspaceId, subscribedJourneys });
              } catch (e) {
                hasFailed = true;
                reject(e);
                return;
              }

              unprocessedRowSets -= 1;
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              if (!hasFailed && hasEnded && unprocessedRowSets === 0) {
                resolve(0);
              }
            })();
          });

          stream.on("end", () => {
            if (!hasFailed && unprocessedRowSets === 0) {
              resolve(0);
            }
            hasEnded = true;
          });
        });
      } catch (e) {
        logger().error(
          {
            err: e,
            pageQueryId,
            tmpTableQueryId,
          },
          "failed to process rows"
        );
        throw e;
      }

      // If no rows were fetched in this iteration, break out of the loop.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (receivedRows < readQueryPageSize) {
        break;
      }

      // Increment the offset by PAGE_SIZE to fetch the next set of rows in the next iteration.
      offset += readQueryPageSize;
    }
  } finally {
    const tmpTableQueryId = randomUUID();
    try {
      await clickhouseClient.query({
        query: `DROP TABLE IF EXISTS ${tmpTableName}`,
        query_params: readChqb.getQueries(),
        query_id: tmpTableQueryId,
        format: "JSONEachRow",
      });
    } catch (e) {
      logger().error(
        {
          workspaceId,
          queryId: tmpTableQueryId,
          err: e,
        },
        "failed to cleanup temp table"
      );
    }
    logger().info(
      {
        workspaceId,
        queryId: tmpTableQueryId,
      },
      "cleanup temp table"
    );
  }

  await clickhouseClient.close();
  return ok(null);
}

interface ComputePropertiesPeriodParams {
  currentTime: number;
  subscribedJourneys: EnrichedJourney[];
  userProperties: EnrichedUserProperty[];
  workspaceId: string;
  tableVersion: string;
  segmentIds?: string[];
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
