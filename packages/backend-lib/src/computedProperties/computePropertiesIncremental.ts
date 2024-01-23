/* eslint-disable no-await-in-loop */

import { Prisma } from "@prisma/client";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import jsonPath from "jsonpath";
import { mapValues } from "remeda";
import { v5 as uuidv5 } from "uuid";

import {
  ClickHouseQueryBuilder,
  command,
  getChCompatibleUuid,
  query as chQuery,
  streamClickhouseQuery,
} from "../clickhouse";
import config from "../config";
import { HUBSPOT_INTEGRATION } from "../constants";
import { startHubspotUserIntegrationWorkflow } from "../integrations/hubspot/signalUtils";
import { getSubscribedSegments } from "../journeys";
import {
  segmentUpdateSignal,
  userJourneyWorkflow,
} from "../journeys/userWorkflow";
import logger from "../logger";
import { withSpan } from "../openTelemetry";
import prisma from "../prisma";
import { upsertBulkSegmentAssignments } from "../segments";
import { getContext } from "../temporal/activity";
import {
  BroadcastSegmentNode,
  ComputedAssignment,
  ComputedPropertyAssignment,
  ComputedPropertyPeriod,
  ComputedPropertyUpdate,
  EmailSegmentNode,
  GroupChildrenUserPropertyDefinitions,
  GroupUserPropertyDefinition,
  InternalEventType,
  JourneyResource,
  LastPerformedSegmentNode,
  LeafUserPropertyDefinition,
  NodeEnvEnum,
  PerformedSegmentNode,
  RelationalOperators,
  SavedIntegrationResource,
  SavedJourneyResource,
  SavedSegmentResource,
  SavedUserPropertyResource,
  SegmentNode,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentUpdate,
  SubscriptionChange,
  SubscriptionGroupSegmentNode,
  SubscriptionGroupType,
  UserPropertyDefinitionType,
} from "../types";
import { insertProcessedComputedProperties } from "../userEvents/clickhouse";
import { upsertBulkUserPropertyAssignments } from "../userProperties";

function broadcastSegmentToPerformed(
  segmentId: string,
  node: BroadcastSegmentNode
): PerformedSegmentNode {
  return {
    id: node.id,
    type: SegmentNodeType.Performed,
    event: InternalEventType.SegmentBroadcast,
    times: 1,
    timesOperator: RelationalOperators.GreaterThanOrEqual,
    properties: [
      {
        path: "segmentId",
        operator: {
          type: SegmentOperatorType.Equals,
          value: segmentId,
        },
      },
    ],
  };
}

function emailSegmentToPerformed(node: EmailSegmentNode): PerformedSegmentNode {
  return {
    id: node.id,
    type: SegmentNodeType.Performed,
    event: node.event,
    times: 1,
    timesOperator: RelationalOperators.GreaterThanOrEqual,
    properties: [
      {
        path: "templateId",
        operator: {
          type: SegmentOperatorType.Equals,
          value: node.templateId,
        },
      },
    ],
  };
}

function subscriptionChangeToPerformed(
  node: SubscriptionGroupSegmentNode
): LastPerformedSegmentNode {
  let hasProperties: LastPerformedSegmentNode["hasProperties"];
  switch (node.subscriptionGroupType) {
    case SubscriptionGroupType.OptIn:
      hasProperties = [
        {
          path: "action",
          operator: {
            type: SegmentOperatorType.Equals,
            value: SubscriptionChange.Subscribe,
          },
        },
      ];
      break;
    case SubscriptionGroupType.OptOut:
      hasProperties = [
        {
          path: "action",
          operator: {
            type: SegmentOperatorType.NotEquals,
            value: SubscriptionChange.Unsubscribe,
          },
        },
      ];
      break;
  }

  return {
    id: node.id,
    type: SegmentNodeType.LastPerformed,
    event: InternalEventType.SubscriptionChange,
    whereProperties: [
      {
        path: "subscriptionId",
        operator: {
          type: SegmentOperatorType.Equals,
          value: node.subscriptionGroupId,
        },
      },
    ],
    hasProperties,
  };
}

async function signalJourney({
  segmentId,
  workspaceId,
  segmentAssignment,
  journey,
}: {
  segmentId: string;
  workspaceId: string;
  segmentAssignment: ComputedAssignment;
  journey: JourneyResource;
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

export enum ComputedPropertyStep {
  ComputeState = "ComputeState",
  ComputeAssignments = "ComputeAssignments",
  ProcessAssignments = "ProcessAssignments",
}

type PeriodByComputedPropertyIdMap = Map<
  string,
  Pick<
    AggregatedComputedPropertyPeriod,
    "maxTo" | "computedPropertyId" | "version"
  >
>;

class PeriodByComputedPropertyId {
  private map: PeriodByComputedPropertyIdMap;

  static getKey({
    computedPropertyId,
    version,
  }: {
    computedPropertyId: string;
    version: string;
  }) {
    return `${computedPropertyId}-${version}`;
  }

  constructor(map: PeriodByComputedPropertyIdMap) {
    this.map = map;
  }

  get({
    computedPropertyId,
    version,
  }: {
    computedPropertyId: string;
    version: string;
  }) {
    return this.map.get(
      PeriodByComputedPropertyId.getKey({
        computedPropertyId,
        version,
      })
    );
  }
}

async function getPeriodsByComputedPropertyId({
  workspaceId,
  step,
}: {
  workspaceId: string;
  step: ComputedPropertyStep;
}): Promise<PeriodByComputedPropertyId> {
  const periodsQuery = Prisma.sql`
    SELECT DISTINCT ON ("workspaceId", "type", "computedPropertyId")
      "type",
      "computedPropertyId",
      "version",
      MAX("to") OVER (PARTITION BY "workspaceId", "type", "computedPropertyId") as "maxTo"
    FROM "ComputedPropertyPeriod"
    WHERE
      "workspaceId" = CAST(${workspaceId} AS UUID)
      AND "step" = ${step}
    ORDER BY "workspaceId", "type", "computedPropertyId", "to" DESC;
  `;
  const periods = await prisma().$queryRaw<AggregatedComputedPropertyPeriod[]>(
    periodsQuery
  );

  const periodByComputedPropertyId =
    periods.reduce<PeriodByComputedPropertyIdMap>((acc, period) => {
      const { maxTo } = period;
      const key = PeriodByComputedPropertyId.getKey(period);
      acc.set(key, {
        maxTo,
        computedPropertyId: period.computedPropertyId,
        version: period.version,
      });
      return acc;
    }, new Map());

  return new PeriodByComputedPropertyId(periodByComputedPropertyId);
}

async function createPeriods({
  workspaceId,
  userProperties,
  segments,
  now,
  periodByComputedPropertyId,
  step,
}: {
  step: ComputedPropertyStep;
  workspaceId: string;
  userProperties: SavedUserPropertyResource[];
  segments: SavedSegmentResource[];
  periodByComputedPropertyId: PeriodByComputedPropertyId;
  now: number;
}) {
  const newPeriods: Prisma.ComputedPropertyPeriodCreateManyInput[] = [];

  for (const segment of segments) {
    const version = segment.definitionUpdatedAt.toString();
    const previousPeriod = periodByComputedPropertyId.get({
      version,
      computedPropertyId: segment.id,
    });
    newPeriods.push({
      workspaceId,
      step,
      type: "Segment",
      computedPropertyId: segment.id,
      from: previousPeriod ? new Date(previousPeriod.maxTo) : null,
      to: new Date(now),
      version,
    });
  }

  for (const userProperty of userProperties) {
    const version = userProperty.definitionUpdatedAt.toString();
    const previousPeriod = periodByComputedPropertyId.get({
      version,
      computedPropertyId: userProperty.id,
    });
    newPeriods.push({
      workspaceId,
      step,
      type: "UserProperty",
      computedPropertyId: userProperty.id,
      from: previousPeriod ? new Date(previousPeriod.maxTo) : null,
      to: new Date(now),
      version,
    });
  }

  await prisma().$transaction(async (tx) => {
    await tx.computedPropertyPeriod.createMany({
      data: newPeriods,
      skipDuplicates: true,
    });
    await tx.computedPropertyPeriod.deleteMany({
      where: {
        workspaceId,
        step,
        to: {
          // 5 minutes retention
          lt: new Date(now - 60 * 1000 * 5),
        },
      },
    });
  });
}

interface FullSubQueryData {
  condition: string;
  type: "user_property" | "segment";
  computedPropertyId: string;
  stateId: string;
  argMaxValue?: string;
  uniqValue?: string;
  recordMessageId?: boolean;
  // used to force computed properties to refresh when definition changes
  version: string;
}

type SubQueryData = Omit<FullSubQueryData, "version">;

type AggregatedComputedPropertyPeriod = Omit<
  ComputedPropertyPeriod,
  "from" | "workspaceId" | "to"
> & {
  maxTo: ComputedPropertyPeriod["to"];
};

export function segmentNodeStateId(
  segment: SavedSegmentResource,
  nodeId: string
): string {
  return uuidv5(
    `${segment.definitionUpdatedAt.toString()}:${nodeId}`,
    segment.id
  );
}

function toJsonPathParam({
  path,
  qb,
}: {
  path: string;
  qb: ClickHouseQueryBuilder;
}): string | null {
  const unvalidated = `$.${path}`;
  try {
    jsonPath.parse(unvalidated);
  } catch (e) {
    logger().debug(
      {
        unvalidated,
        err: e,
      },
      "invalid json path in node path"
    );
    return null;
  }
  return qb.addQueryValue(unvalidated, "String");
}

export function segmentNodeToStateSubQuery({
  segment,
  node,
  qb,
}: {
  segment: SavedSegmentResource;
  node: SegmentNode;
  qb: ClickHouseQueryBuilder;
}): SubQueryData[] {
  switch (node.type) {
    case SegmentNodeType.Trait: {
      const stateId = segmentNodeStateId(segment, node.id);
      const path = toJsonPathParam({
        path: node.path,
        qb,
      });
      if (!path) {
        return [];
      }
      return [
        {
          condition: `event_type == 'identify'`,
          type: "segment",
          uniqValue: "''",
          argMaxValue: `JSON_VALUE(properties, ${path})`,
          computedPropertyId: segment.id,
          stateId,
        },
      ];
    }
    case SegmentNodeType.Performed: {
      const stateId = segmentNodeStateId(segment, node.id);
      const event = qb.addQueryValue(node.event, "String");
      const propertyConditions = node.properties?.map((property) => {
        const operatorType = property.operator.type;
        switch (operatorType) {
          case SegmentOperatorType.Equals: {
            const path = toJsonPathParam({
              path: property.path,
              qb,
            });
            if (!path) {
              return [];
            }
            return `JSON_VALUE(properties, ${path}) == ${qb.addQueryValue(
              property.operator.value,
              "String"
            )}`;
          }
          default:
            throw new Error(
              `Unimplemented segment operator for performed node ${operatorType} for segment: ${segment.id} and node: ${node.id}`
            );
        }
      });
      const propertyClause = propertyConditions?.length
        ? `and (${propertyConditions.join(" and ")})`
        : "";
      return [
        {
          condition: `event_type == 'track' and event == ${event} ${propertyClause}`,
          type: "segment",
          uniqValue: "message_id",
          argMaxValue: "''",
          computedPropertyId: segment.id,
          stateId,
        },
      ];
    }
    case SegmentNodeType.And: {
      return node.children.flatMap((child) => {
        const childNode = segment.definition.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              segment,
              child,
              node,
            },
            "AND child node not found"
          );
          return [];
        }
        return segmentNodeToStateSubQuery({
          node: childNode,
          segment,
          qb,
        });
      });
    }
    case SegmentNodeType.Or: {
      return node.children.flatMap((child) => {
        const childNode = segment.definition.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              segment,
              child,
              node,
            },
            "Or child node not found"
          );
          return [];
        }
        return segmentNodeToStateSubQuery({
          node: childNode,
          segment,
          qb,
        });
      });
    }
    case SegmentNodeType.LastPerformed: {
      const stateId = segmentNodeStateId(segment, node.id);
      const whereConditions = node.whereProperties?.map((property) => {
        const operatorType = property.operator.type;
        const path = toJsonPathParam({
          path: property.path,
          qb,
        });
        if (!path) {
          return [];
        }
        const propertyValue = `JSON_VALUE(properties, ${path})`;
        switch (operatorType) {
          case SegmentOperatorType.Equals: {
            return `${propertyValue} == ${qb.addQueryValue(
              property.operator.value,
              "String"
            )}`;
          }
          case SegmentOperatorType.NotEquals: {
            return `${propertyValue} != ${qb.addQueryValue(
              property.operator.value,
              "String"
            )}`;
          }
          default:
            throw new Error(
              `Unimplemented segment operator for performed node ${operatorType} for segment: ${segment.id} and node: ${node.id}`
            );
        }
      });
      const wherePropertyClause = whereConditions?.length
        ? `and (${whereConditions.join(" and ")})`
        : "";
      const propertyValues = node.hasProperties.flatMap((property) => {
        const path = toJsonPathParam({
          path: property.path,
          qb,
        });
        if (!path) {
          return [];
        }
        return `JSON_VALUE(properties, ${path})`;
      });
      if (propertyValues.length === 0) {
        return [];
      }

      const event = qb.addQueryValue(node.event, "String");
      const condition = `event_type == 'track' and event == ${event} ${wherePropertyClause}`;
      return [
        {
          condition,
          type: "segment",
          uniqValue: "''",
          argMaxValue: `toJSONString([${propertyValues.join(", ")}])`,
          computedPropertyId: segment.id,
          stateId,
        },
      ];
    }
    case SegmentNodeType.Broadcast: {
      const performedNode: PerformedSegmentNode = broadcastSegmentToPerformed(
        segment.id,
        node
      );
      return segmentNodeToStateSubQuery({
        node: performedNode,
        segment,
        qb,
      });
    }
    case SegmentNodeType.Email: {
      const performedNode: PerformedSegmentNode = emailSegmentToPerformed(node);
      return segmentNodeToStateSubQuery({
        node: performedNode,
        segment,
        qb,
      });
    }
    case SegmentNodeType.SubscriptionGroup: {
      const performedNode: LastPerformedSegmentNode =
        subscriptionChangeToPerformed(node);
      return segmentNodeToStateSubQuery({
        node: performedNode,
        segment,
        qb,
      });
    }
  }
}

export function userPropertyStateId(
  userProperty: SavedUserPropertyResource,
  nodeId = ""
): string {
  const stateId = uuidv5(
    `${userProperty.definitionUpdatedAt.toString()}:${nodeId}`,
    userProperty.id
  );
  return stateId;
}

function leafUserPropertyToSubQuery({
  userProperty,
  child,
  qb,
}: {
  userProperty: SavedUserPropertyResource;
  child: LeafUserPropertyDefinition;
  qb: ClickHouseQueryBuilder;
}): SubQueryData | null {
  switch (child.type) {
    case UserPropertyDefinitionType.Trait: {
      const stateId = userPropertyStateId(userProperty, child.id);
      if (child.path.length === 0) {
        return null;
      }
      const path = toJsonPathParam({
        path: child.path,
        qb,
      });
      if (!path) {
        return null;
      }
      return {
        condition: `event_type == 'identify'`,
        type: "user_property",
        uniqValue: "''",
        argMaxValue: `JSON_VALUE(properties, ${path})`,
        computedPropertyId: userProperty.id,
        stateId,
      };
    }
    case UserPropertyDefinitionType.Performed: {
      const stateId = userPropertyStateId(userProperty, child.id);
      if (child.path.length === 0) {
        return null;
      }
      const path = toJsonPathParam({
        path: child.path,
        qb,
      });
      if (!path) {
        return null;
      }
      return {
        condition: `event_type == 'track' and event = ${qb.addQueryValue(
          child.event,
          "String"
        )}`,
        type: "user_property",
        uniqValue: "''",
        argMaxValue: `JSON_VALUE(properties, ${path})`,
        computedPropertyId: userProperty.id,
        stateId,
      };
    }
  }
}

function groupedUserPropertyToSubQuery({
  userProperty,
  group,
  node,
  qb,
}: {
  userProperty: SavedUserPropertyResource;
  node: GroupChildrenUserPropertyDefinitions;
  group: GroupUserPropertyDefinition;
  qb: ClickHouseQueryBuilder;
}): SubQueryData[] {
  switch (node.type) {
    case UserPropertyDefinitionType.AnyOf: {
      return node.children.flatMap((child) => {
        const childNode = group.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              userProperty,
              child,
              node,
            },
            "Grouped user property child node not found"
          );
          return [];
        }
        return groupedUserPropertyToSubQuery({
          userProperty,
          node: childNode,
          group,
          qb,
        });
      });
    }
    case UserPropertyDefinitionType.Trait: {
      const subQuery = leafUserPropertyToSubQuery({
        userProperty,
        child: node,
        qb,
      });

      if (!subQuery) {
        return [];
      }
      return [subQuery];
    }
    case UserPropertyDefinitionType.Performed: {
      const subQuery = leafUserPropertyToSubQuery({
        userProperty,
        child: node,
        qb,
      });

      if (!subQuery) {
        return [];
      }
      return [subQuery];
    }
  }
}

function userPropertyToSubQuery({
  userProperty,
  qb,
}: {
  userProperty: SavedUserPropertyResource;
  qb: ClickHouseQueryBuilder;
}): SubQueryData[] {
  const stateId = userPropertyStateId(userProperty);
  switch (userProperty.definition.type) {
    case UserPropertyDefinitionType.Trait: {
      const subQuery = leafUserPropertyToSubQuery({
        userProperty,
        child: userProperty.definition,
        qb,
      });

      if (!subQuery) {
        return [];
      }
      return [subQuery];
    }
    case UserPropertyDefinitionType.Performed: {
      const subQuery = leafUserPropertyToSubQuery({
        userProperty,
        child: userProperty.definition,
        qb,
      });

      if (!subQuery) {
        return [];
      }
      return [subQuery];
    }
    case UserPropertyDefinitionType.Group: {
      const entryId = userProperty.definition.entry;
      const entryNode = userProperty.definition.nodes.find(
        (n) => n.id === entryId
      );
      if (!entryNode) {
        logger().error(
          {
            userProperty,
            entryId,
          },
          "Grouped user property entry node not found"
        );
        return [];
      }
      return groupedUserPropertyToSubQuery({
        userProperty,
        node: entryNode,
        group: userProperty.definition,
        qb,
      });
    }
    case UserPropertyDefinitionType.PerformedMany: {
      return [
        {
          condition: `event_type == 'track' and has(${qb.addQueryValue(
            userProperty.definition.or.map((event) => event.event),
            "Array(String)"
          )}, event)`,
          type: "user_property",
          recordMessageId: true,
          computedPropertyId: userProperty.id,
          stateId,
        },
      ];
    }
    case UserPropertyDefinitionType.AnonymousId: {
      return [
        {
          condition: "True",
          type: "user_property",
          computedPropertyId: userProperty.id,
          argMaxValue: "anonymous_id",
          stateId,
        },
      ];
    }
    case UserPropertyDefinitionType.Id: {
      return [
        {
          condition: "True",
          type: "user_property",
          computedPropertyId: userProperty.id,
          argMaxValue: "user_or_anonymous_id",
          stateId,
        },
      ];
    }
  }
}

interface AssignmentQueryConfig {
  query: string;
  // ids of states to aggregate that need to fall within bounded time window
  stateIds: string[];
  // ids of states to aggregate that don't need to fall within bounded time window
  unboundedStateIds: string[];
}

type OptionalAssignmentQueryConfig = Omit<
  AssignmentQueryConfig,
  "version"
> | null;

function leafUserPropertyToAssignment({
  userProperty,
  child,
  qb,
}: {
  userProperty: SavedUserPropertyResource;
  child: LeafUserPropertyDefinition;
  qb: ClickHouseQueryBuilder;
}): OptionalAssignmentQueryConfig {
  switch (child.type) {
    case UserPropertyDefinitionType.Trait: {
      const stateId = userPropertyStateId(userProperty, child.id);
      return {
        query: `last_value[${qb.addQueryValue(stateId, "String")}]`,
        stateIds: [stateId],
        unboundedStateIds: [],
      };
    }
    case UserPropertyDefinitionType.Performed: {
      const stateId = userPropertyStateId(userProperty, child.id);
      return {
        query: `last_value[${qb.addQueryValue(stateId, "String")}]`,
        stateIds: [stateId],
        unboundedStateIds: [],
      };
    }
  }
}

function groupedUserPropertyToAssignment({
  userProperty,
  group,
  node,
  qb,
}: {
  userProperty: SavedUserPropertyResource;
  node: GroupChildrenUserPropertyDefinitions;
  group: GroupUserPropertyDefinition;
  qb: ClickHouseQueryBuilder;
}): OptionalAssignmentQueryConfig {
  switch (node.type) {
    case UserPropertyDefinitionType.AnyOf: {
      const childNodes = node.children.flatMap((child) => {
        const childNode = group.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              userProperty,
              child,
              node,
            },
            "Grouped user property child node not found"
          );
          return [];
        }
        const assignment = groupedUserPropertyToAssignment({
          userProperty,
          node: childNode,
          group,
          qb,
        });
        if (!assignment) {
          return [];
        }
        return assignment;
      });
      if (childNodes.length === 0) {
        return null;
      }
      if (childNodes.length === 1 && childNodes[0]) {
        return childNodes[0];
      }
      const query = `coalesce(${childNodes
        .map((c) => {
          const varName = getChCompatibleUuid();
          return `if((${c.query} as ${varName}) == '', Null, ${varName})`;
        })
        .join(", ")})`;
      return {
        query,
        stateIds: childNodes.flatMap((c) => c.stateIds),
        unboundedStateIds: childNodes.flatMap((c) => c.unboundedStateIds),
      };
    }
    case UserPropertyDefinitionType.Trait: {
      return leafUserPropertyToAssignment({
        userProperty,
        child: node,
        qb,
      });
    }
    case UserPropertyDefinitionType.Performed: {
      return leafUserPropertyToAssignment({
        userProperty,
        child: node,
        qb,
      });
    }
  }
}

function userPropertyToAssignment({
  userProperty,
  qb,
}: {
  userProperty: SavedUserPropertyResource;
  qb: ClickHouseQueryBuilder;
}): OptionalAssignmentQueryConfig {
  switch (userProperty.definition.type) {
    case UserPropertyDefinitionType.Trait: {
      return leafUserPropertyToAssignment({
        userProperty,
        child: userProperty.definition,
        qb,
      });
    }
    case UserPropertyDefinitionType.Group: {
      const entryId = userProperty.definition.entry;
      const entryNode = userProperty.definition.nodes.find(
        (n) => n.id === entryId
      );
      if (!entryNode) {
        logger().error(
          {
            userProperty,
            entryId,
          },
          "Grouped user property entry node not found"
        );
        return null;
      }
      return groupedUserPropertyToAssignment({
        userProperty,
        node: entryNode,
        group: userProperty.definition,
        qb,
      });
    }
    case UserPropertyDefinitionType.PerformedMany: {
      const stateId = userPropertyStateId(userProperty);
      return {
        query: `
          toJSONString(
            arrayMap(
              event ->
                map(
                  'event',
                  event.1,
                  'timestamp',
                  formatDateTime(
                    event.2,
                    '%Y-%m-%dT%H:%i:%S'
                  ),
                  'properties',
                  event.3
                ),
              arraySort(
                e -> -toInt32(e.2),
                grouped_events[${qb.addQueryValue(stateId, "String")}]
              )
            )
          )`,
        stateIds: [stateId],
        unboundedStateIds: [],
      };
    }
    case UserPropertyDefinitionType.AnonymousId: {
      const stateId = userPropertyStateId(userProperty);
      return {
        query: `last_value[${qb.addQueryValue(stateId, "String")}]`,
        stateIds: [stateId],
        unboundedStateIds: [],
      };
    }
    case UserPropertyDefinitionType.Id: {
      const stateId = userPropertyStateId(userProperty);
      return {
        query: `last_value[${qb.addQueryValue(stateId, "String")}]`,
        stateIds: [stateId],
        unboundedStateIds: [],
      };
    }
    case UserPropertyDefinitionType.Performed: {
      return leafUserPropertyToAssignment({
        userProperty,
        child: userProperty.definition,
        qb,
      });
    }
  }
}

function segmentToAssignment({
  segment,
  node,
  now,
  qb,
}: {
  segment: SavedSegmentResource;
  node: SegmentNode;
  now: number;
  qb: ClickHouseQueryBuilder;
}): OptionalAssignmentQueryConfig {
  const stateId = segmentNodeStateId(segment, node.id);
  const nowSeconds = now / 1000;
  const stateIdQueryValue = qb.addQueryValue(stateId, "String");
  const lastValue = `last_value[${stateIdQueryValue}]`;
  const uniqCount = `unique_count[${stateIdQueryValue}]`;
  const maxEventTime = `max_event_time[${stateIdQueryValue}]`;

  switch (node.type) {
    case SegmentNodeType.Trait: {
      switch (node.operator.type) {
        case SegmentOperatorType.Equals: {
          const value = qb.addQueryValue(node.operator.value, "String");
          const query = `${lastValue} == ${value}`;
          return {
            query,
            stateIds: [stateId],
            unboundedStateIds: [],
          };
        }
        case SegmentOperatorType.NotEquals: {
          const value = qb.addQueryValue(node.operator.value, "String");
          const query = `${lastValue} != ${value}`;
          return {
            query,
            stateIds: [stateId],
            unboundedStateIds: [],
          };
        }
        case SegmentOperatorType.Within: {
          const lowerBound = Math.round(
            Math.max(nowSeconds - node.operator.windowSeconds, 0)
          );
          const name = getChCompatibleUuid();
          const query = `
              and(
                not(
                  isNull(
                    parseDateTime64BestEffortOrNull(${lastValue}) as ${name}
                  )
                ),
                ${name} >= toDateTime64(${lowerBound}, 3)
              )
            `;
          return {
            query,
            stateIds: [],
            unboundedStateIds: [stateId],
          };
        }
        case SegmentOperatorType.Exists: {
          const query = `${lastValue} != '""'`;
          return {
            query,
            stateIds: [stateId],
            unboundedStateIds: [],
          };
        }
        case SegmentOperatorType.HasBeen: {
          const upperBound = Math.max(
            nowSeconds - node.operator.windowSeconds,
            0
          );
          const query = `${maxEventTime} < toDateTime64(${upperBound}, 3) and ${lastValue} == ${qb.addQueryValue(
            node.operator.value,
            "String"
          )}`;
          return {
            query,
            stateIds: [],
            unboundedStateIds: [stateId],
          };
        }
      }
      break;
    }
    case SegmentNodeType.Performed: {
      const operator: string = node.timesOperator ?? RelationalOperators.Equals;
      const times = node.times === undefined ? 1 : node.times;
      let isUnbounded = false;

      const queries: string[] = [
        `${uniqCount} ${operator} ${qb.addQueryValue(times, "Int32")}`,
      ];
      if (node.withinSeconds !== undefined && node.withinSeconds) {
        isUnbounded = true;
        const lowerBound = Math.max(nowSeconds - node.withinSeconds, 0);
        queries.push(`${maxEventTime} >= toDateTime64(${lowerBound}, 3)`);
      }

      const stateIds = isUnbounded ? [] : [stateId];
      const unboundedStateIds = isUnbounded ? [stateId] : [];
      const query =
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        queries.length === 1 ? queries[0]! : `(${queries.join(" and ")})`;

      return {
        query,
        stateIds,
        unboundedStateIds,
      };
    }
    case SegmentNodeType.LastPerformed: {
      const varName = getChCompatibleUuid();
      const hasPropertyConditions = node.hasProperties.map((property, i) => {
        const operatorType = property.operator.type;
        const reference =
          i === 0
            ? `(JSONExtract(${lastValue}, 'Array(String)') as ${varName})`
            : varName;
        const indexedReference = `${reference}[${i + 1}]`;

        switch (operatorType) {
          case SegmentOperatorType.Equals: {
            return `${indexedReference} == ${qb.addQueryValue(
              property.operator.value,
              "String"
            )}`;
          }
          case SegmentOperatorType.NotEquals: {
            return `${indexedReference} != ${qb.addQueryValue(
              property.operator.value,
              "String"
            )}`;
          }
          default:
            throw new Error(
              `Unimplemented segment operator for performed node ${operatorType} for segment: ${segment.id} and node: ${node.id}`
            );
        }
      });
      const query = hasPropertyConditions.length
        ? `(${hasPropertyConditions.join(" and ")})`
        : `1=1`;

      return {
        query,
        stateIds: [stateId],
        unboundedStateIds: [],
      };
    }
    case SegmentNodeType.And: {
      const childQueries = node.children.flatMap((child) => {
        const childNode = segment.definition.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              segment,
              child,
              node,
            },
            "AND child node not found"
          );
          return [];
        }
        const assignment = segmentToAssignment({
          node: childNode,
          segment,
          now,
          qb,
        });
        if (!assignment) {
          return [];
        }
        return assignment;
      });
      if (childQueries.length === 0) {
        return null;
      }
      if (childQueries.length === 1 && childQueries[0]) {
        return childQueries[0];
      }
      const query = `(${childQueries.map((c) => c.query).join(" and ")})`;
      return {
        query,
        stateIds: childQueries.flatMap((c) => c.stateIds),
        unboundedStateIds: childQueries.flatMap((c) => c.unboundedStateIds),
      };
    }
    case SegmentNodeType.Or: {
      const childQueries = node.children.flatMap((child) => {
        const childNode = segment.definition.nodes.find((n) => n.id === child);
        if (!childNode) {
          logger().error(
            {
              segment,
              child,
              node,
            },
            "Or child node not found"
          );
          return [];
        }
        const assignment = segmentToAssignment({
          node: childNode,
          segment,
          now,
          qb,
        });
        if (!assignment) {
          return [];
        }
        return assignment;
      });
      if (childQueries.length === 0) {
        return null;
      }
      if (childQueries.length === 1 && childQueries[0]) {
        return childQueries[0];
      }
      const query = `(${childQueries.map((c) => c.query).join(" or ")})`;
      return {
        query,
        stateIds: childQueries.flatMap((c) => c.stateIds),
        unboundedStateIds: childQueries.flatMap((c) => c.unboundedStateIds),
      };
    }
    case SegmentNodeType.Broadcast: {
      const performedNode: PerformedSegmentNode = broadcastSegmentToPerformed(
        segment.id,
        node
      );
      return segmentToAssignment({
        node: performedNode,
        segment,
        now,
        qb,
      });
    }
    case SegmentNodeType.Email: {
      const performedNode: PerformedSegmentNode = emailSegmentToPerformed(node);
      return segmentToAssignment({
        node: performedNode,
        segment,
        now,
        qb,
      });
    }
    case SegmentNodeType.SubscriptionGroup: {
      const lastPerformedNode: LastPerformedSegmentNode =
        subscriptionChangeToPerformed(node);

      return segmentToAssignment({
        node: lastPerformedNode,
        segment,
        now,
        qb,
      });
    }
  }
}

function constructAssignmentsQuery({
  workspaceId,
  config: ac,
  computedPropertyId,
  computedPropertyType,
  periodBound,
  qb,
  now,
}: {
  workspaceId: string;
  now: number;
  qb: ClickHouseQueryBuilder;
  periodBound?: number;
  computedPropertyId: string;
  computedPropertyType: "user_property" | "segment";
  config: AssignmentQueryConfig;
}): string | null {
  const nowSeconds = now / 1000;
  const lowerBoundClause =
    periodBound && periodBound !== 0
      ? `and computed_at >= toDateTime64(${periodBound / 1000}, 3)`
      : "";

  const stateIdClauses: string[] = [];
  if (ac.stateIds.length > 0) {
    stateIdClauses.push(
      `(state_id in ${qb.addQueryValue(
        ac.stateIds,
        "Array(String)"
      )} ${lowerBoundClause})`
    );
  }
  if (ac.unboundedStateIds.length > 0) {
    stateIdClauses.push(
      `state_id in ${qb.addQueryValue(ac.unboundedStateIds, "Array(String)")}`
    );
  }
  if (stateIdClauses.length === 0) {
    logger().error(
      {
        config: ac,
        computedPropertyId,
        computedPropertyType,
      },
      "missing state id clauses while assigning computed property"
    );
    return null;
  }
  const stateIdClause = `and (${stateIdClauses.join(" or ")})`;
  let segmentValue: string;
  let userPropertyValue: string;
  if (computedPropertyType === "segment") {
    userPropertyValue = "''";
    segmentValue = ac.query;
  } else {
    segmentValue = "False";
    userPropertyValue = ac.query;
  }
  const query = `
    insert into computed_property_assignments_v2
    select
      workspace_id,
      type,
      computed_property_id,
      user_id,
      ${segmentValue} as segment_value,
      ${userPropertyValue} as user_property_value,
      arrayReduce('max', mapValues(max_event_time)),
      toDateTime64(${nowSeconds}, 3) as assigned_at
    from (
      select
        workspace_id,
        type,
        computed_property_id,
        user_id,
        CAST((groupArray(state_id), groupArray(last_value)), 'Map(String, String)') as last_value,
        CAST((groupArray(state_id), groupArray(unique_count)), 'Map(String, Int32)') as unique_count,
        CAST((groupArray(state_id), groupArray(max_event_time)), 'Map(String, DateTime64(3))') as max_event_time,
        CAST(
          (
            groupArray(state_id),
            groupArray(events)
          ),
          'Map(String, Array(Tuple(String, DateTime64(3), String)))'
        ) as grouped_events
      from (
        select
          inner2.workspace_id as workspace_id,
          inner2.type as type,
          inner2.computed_property_id as computed_property_id,
          inner2.state_id as state_id,
          inner2.user_id as user_id,
          inner2.last_value as last_value,
          inner2.unique_count as unique_count,
          inner2.max_event_time as max_event_time,
          groupArray((inner2.event, inner2.event_time, inner2.properties)) as events
        from (
          select
            inner1.workspace_id as workspace_id,
            inner1.type as type,
            inner1.computed_property_id as computed_property_id,
            inner1.state_id as state_id,
            inner1.user_id as user_id,
            inner1.last_value as last_value,
            inner1.unique_count as unique_count,
            inner1.max_event_time as max_event_time,
            ue.event as event,
            ue.event_time as event_time,
            ue.properties as properties
          from user_events_v2 ue
          right any join (
            select
              workspace_id,
              type,
              computed_property_id,
              state_id,
              user_id,
              argMaxMerge(last_value) last_value,
              uniqMerge(unique_count) unique_count,
              maxMerge(max_event_time) max_event_time,
              arrayJoin(groupArrayMerge(cps.grouped_message_ids)) message_id
            from computed_property_state cps
            where
              (
                workspace_id,
                type,
                computed_property_id,
                state_id,
                user_id
              ) in (
                select
                  workspace_id,
                  type,
                  computed_property_id,
                  state_id,
                  user_id
                from updated_computed_property_state
                where
                  workspace_id = ${qb.addQueryValue(workspaceId, "String")}
                  and type = '${computedPropertyType}'
                  and computed_property_id = ${qb.addQueryValue(
                    computedPropertyId,
                    "String"
                  )}
                  and computed_at <= toDateTime64(${nowSeconds}, 3)
                  ${stateIdClause}
              )
            group by
              workspace_id,
              type,
              computed_property_id,
              state_id,
              user_id
          ) as inner1 on
            inner1.message_id != ''
            and inner1.message_id = ue.message_id
          group by
            workspace_id,
            type,
            computed_property_id,
            state_id,
            user_id,
            last_value,
            unique_count,
            max_event_time,
            event,
            event_time,
            properties
        ) inner2
        group by
          workspace_id,
          type,
          computed_property_id,
          state_id,
          user_id,
          last_value,
          unique_count,
          max_event_time
      ) inner3
      group by
        workspace_id,
        type,
        computed_property_id,
        user_id
    ) inner4
  `;
  return query;
}

export interface ComputePropertiesArgs {
  integrations: SavedIntegrationResource[];
  journeys: SavedJourneyResource[];
  // timestamp in ms
  now: number;
  segments: SavedSegmentResource[];
  userProperties: SavedUserPropertyResource[];
  workspaceId: string;
}

export type PartialComputePropertiesArgs = Omit<
  ComputePropertiesArgs,
  "journeys" | "integrations"
>;

export async function computeState({
  workspaceId,
  segments,
  userProperties,
  now,
}: PartialComputePropertiesArgs) {
  return withSpan({ name: "compute-state" }, async (span) => {
    span.setAttribute("workspaceId", workspaceId);

    const qb = new ClickHouseQueryBuilder({
      debug:
        config().nodeEnv === NodeEnvEnum.Development ||
        config().nodeEnv === NodeEnvEnum.Test,
    });
    let subQueryData: FullSubQueryData[] = [];

    for (const segment of segments) {
      subQueryData = subQueryData.concat(
        segmentNodeToStateSubQuery({
          segment,
          node: segment.definition.entryNode,
          qb,
        }).map((subQuery) => ({
          ...subQuery,
          version: segment.definitionUpdatedAt.toString(),
        }))
      );
    }

    for (const userProperty of userProperties) {
      subQueryData = subQueryData.concat(
        userPropertyToSubQuery({
          userProperty,
          qb,
        }).map((subQuery) => ({
          ...subQuery,
          version: userProperty.definitionUpdatedAt.toString(),
        }))
      );
    }
    if (subQueryData.length === 0) {
      return;
    }

    const periodByComputedPropertyId = await getPeriodsByComputedPropertyId({
      workspaceId,
      step: ComputedPropertyStep.ComputeState,
    });

    const subQueriesWithPeriods = subQueryData.reduce<
      Record<number, SubQueryData[]>
    >((memo, subQuery) => {
      const period = periodByComputedPropertyId.get(subQuery) ?? null;
      const periodKey = period?.maxTo.getTime() ?? 0;
      const subQueriesForPeriod = memo[periodKey] ?? [];
      memo[periodKey] = [...subQueriesForPeriod, subQuery];
      return memo;
    }, {});

    const nowSeconds = now / 1000;
    const queries = Object.values(
      mapValues(subQueriesWithPeriods, async (periodSubQueries, period) => {
        const lowerBoundClause =
          period !== 0
            ? `and processing_time >= toDateTime64(${period / 1000}, 3)`
            : ``;

        const subQueries = periodSubQueries
          .map(
            (subQuery) => `
            if(
              ${subQuery.condition},
              (
                '${subQuery.type}',
                '${subQuery.computedPropertyId}',
                '${subQuery.stateId}',
                ${subQuery.argMaxValue ?? "''"},
                ${subQuery.uniqValue ?? "''"},
                ${subQuery.recordMessageId ? "message_id" : "''"}
              ),
              (Null, Null, Null, Null, Null, Null)
            )
          `
          )
          .join(", ");
        const query = `
        insert into computed_property_state
        select
          inner2.workspace_id,
          inner2.type,
          inner2.computed_property_id,
          inner2.state_id,
          inner2.user_id,
          inner2.last_value,
          inner2.unique_count,
          inner2.max_event_time,
          inner2.grouped_message_ids,
          toDateTime64(${nowSeconds}, 3) as computed_at
        from (
          select
            inner1.workspace_id as workspace_id,
            inner1.type as type,
            inner1.computed_property_id as computed_property_id,
            inner1.state_id as state_id,
            inner1.user_id as user_id,
            argMaxState(inner1.last_value, inner1.event_time) as last_value,
            uniqState(inner1.unique_count) as unique_count,
            maxState(inner1.event_time) as max_event_time,
            groupArrayState(inner1.grouped_message_id) as grouped_message_ids,
            argMaxMerge(cps.last_value) as existing_last_value,
            uniqMerge(cps.unique_count) as existing_unique_count
          from (
            select
              workspace_id,
              CAST(
                (
                  arrayJoin(
                    arrayFilter(
                      v -> not(isNull(v.1)),
                      [${subQueries}]
                    )
                  ) as c
                ).1,
                'Enum8(\\'user_property\\' = 1, \\'segment\\' = 2)'
              ) as type,
              c.2 as computed_property_id,
              c.3 as state_id,
              user_id,
              ifNull(c.4, '') as last_value,
              ifNull(c.5, '') as unique_count,
              ifNull(c.6, '') as grouped_message_id,
              event_time
            from user_events_v2 ue
            where
              workspace_id = ${qb.addQueryValue(workspaceId, "String")}
              and processing_time <= toDateTime64(${nowSeconds}, 3)
              ${lowerBoundClause}
          ) as inner1
          left join computed_property_state cps on
            inner1.workspace_id = cps.workspace_id
            and inner1.type = cps.type
            and inner1.computed_property_id = cps.computed_property_id
            and inner1.user_id = cps.user_id
            and inner1.state_id = cps.state_id
          group by
            inner1.workspace_id,
            inner1.type,
            inner1.computed_property_id,
            inner1.state_id,
            inner1.user_id,
            inner1.last_value,
            inner1.unique_count,
            inner1.grouped_message_id,
            inner1.event_time
          having
            existing_last_value != inner1.last_value
            OR inner1.unique_count != ''
            OR inner1.grouped_message_id != ''
        ) inner2
      `;

        await command({
          query,
          query_params: qb.getQueries(),
          clickhouse_settings: {
            wait_end_of_query: 1,
            function_json_value_return_type_allow_complex: 1,
          },
        });
      })
    );

    await Promise.all(queries);

    await createPeriods({
      workspaceId,
      userProperties,
      segments,
      now,
      periodByComputedPropertyId,
      step: ComputedPropertyStep.ComputeState,
    });
  });
}

export async function computeAssignments({
  workspaceId,
  segments,
  userProperties,
  now,
}: PartialComputePropertiesArgs): Promise<void> {
  return withSpan({ name: "compute-assignments" }, async (span) => {
    span.setAttribute("workspaceId", workspaceId);

    const queryies: Promise<unknown>[] = [];

    const periodByComputedPropertyId = await getPeriodsByComputedPropertyId({
      workspaceId,
      step: ComputedPropertyStep.ComputeAssignments,
    });

    for (const segment of segments) {
      const version = segment.definitionUpdatedAt.toString();
      const period = periodByComputedPropertyId.get({
        computedPropertyId: segment.id,
        version,
      });
      const qb = new ClickHouseQueryBuilder();
      const ac = segmentToAssignment({
        segment,
        node: segment.definition.entryNode,
        now,
        qb,
      });
      if (!ac) {
        continue;
      }
      const stateQuery = constructAssignmentsQuery({
        workspaceId,
        computedPropertyId: segment.id,
        computedPropertyType: "segment",
        config: ac,
        qb,
        now,
        periodBound: period?.maxTo.getTime(),
      });
      if (!stateQuery) {
        continue;
      }

      queryies.push(
        command({
          query: stateQuery,
          query_params: qb.getQueries(),
          clickhouse_settings: { wait_end_of_query: 1 },
        })
      );
    }

    for (const userProperty of userProperties) {
      const version = userProperty.definitionUpdatedAt.toString();
      const period = periodByComputedPropertyId.get({
        computedPropertyId: userProperty.id,
        version,
      });
      const qb = new ClickHouseQueryBuilder();
      const ac = userPropertyToAssignment({
        userProperty,
        qb,
      });
      if (!ac) {
        continue;
      }
      const stateQuery = constructAssignmentsQuery({
        workspaceId,
        computedPropertyId: userProperty.id,
        computedPropertyType: "user_property",
        config: ac,
        qb,
        now,
        periodBound: period?.maxTo.getTime(),
      });
      if (!stateQuery) {
        continue;
      }

      queryies.push(
        command({
          query: stateQuery,
          query_params: qb.getQueries(),
          clickhouse_settings: { wait_end_of_query: 1 },
        })
      );
    }

    await Promise.all(queryies);

    await createPeriods({
      workspaceId,
      userProperties,
      segments,
      now,
      periodByComputedPropertyId,
      step: ComputedPropertyStep.ComputeAssignments,
    });
  });
}

async function processRows({
  rows,
  workspaceId,
  subscribedJourneys,
}: {
  rows: unknown[];
  workspaceId: string;
  subscribedJourneys: JourneyResource[];
}): Promise<boolean> {
  logger().debug(
    {
      rows,
    },
    "processRows"
  );
  let hasRows = false;
  const assignments: ComputedAssignment[] = rows
    .map((json) => {
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
    .flat();

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
      if (!assignment.latest_segment_value) {
        continue;
      }
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

export async function processAssignments({
  workspaceId,
  userProperties,
  segments,
  integrations,
  journeys,
  now,
}: ComputePropertiesArgs): Promise<void> {
  return withSpan({ name: "process-assignments" }, async (span) => {
    span.setAttribute("workspaceId", workspaceId);

    // segment id / pg + journey id
    const subscribedJourneyMap = journeys.reduce<Map<string, Set<string>>>(
      (memo, j) => {
        const subscribedSegments = getSubscribedSegments(j.definition);

        subscribedSegments.forEach((segmentId) => {
          const processFor = memo.get(segmentId) ?? new Set();
          processFor.add(j.id);
          memo.set(segmentId, processFor);
        });
        return memo;
      },
      new Map()
    );

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

    const qb = new ClickHouseQueryBuilder();

    const subscribedJourneysKeysQuery = qb.addQueryValue(
      subscribedJourneyKeys,
      "Array(String)"
    );

    const subscribedJourneysValuesQuery = qb.addQueryValue(
      subscribedJourneyValues,
      "Array(Array(String))"
    );

    const subscribedIntegrationsUserPropertyKeysQuery = qb.addQueryValue(
      subscribedIntegrationUserPropertyKeys,
      "Array(String)"
    );

    const subscribedIntegrationsUserPropertyValuesQuery = qb.addQueryValue(
      subscribedIntegrationUserPropertyValues,
      "Array(Array(String))"
    );

    const subscribedIntegrationsSegmentKeysQuery = qb.addQueryValue(
      subscribedIntegrationSegmentKeys,
      "Array(String)"
    );

    const subscribedIntegrationsSegmentValuesQuery = qb.addQueryValue(
      subscribedIntegrationSegmentValues,
      "Array(Array(String))"
    );

    const workspaceIdParam = qb.addQueryValue(workspaceId, "String");

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
    const selectQuery = `
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
      FROM computed_property_assignments_v2
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
      FROM processed_computed_properties_v2
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
        )
    )
  `;

    const pageQueryId = getChCompatibleUuid();

    const resultSet = await chQuery({
      query: selectQuery,
      query_id: pageQueryId,
      query_params: qb.getQueries(),
      format: "JSONEachRow",
      clickhouse_settings: { wait_end_of_query: 1 },
    });

    let rowsProcessed = 0;
    try {
      await streamClickhouseQuery(resultSet, async (rows) => {
        rowsProcessed += rows.length;
        await processRows({
          rows,
          workspaceId,
          subscribedJourneys: journeys,
        });
      });
    } catch (e) {
      logger().error(
        {
          err: e,
          pageQueryId,
        },
        "failed to process rows"
      );
    }
    span.setAttribute("rowsProcessed", rowsProcessed);

    // TODO encorporate existing periods into query
    const periodByComputedPropertyId = await getPeriodsByComputedPropertyId({
      workspaceId,
      step: ComputedPropertyStep.ProcessAssignments,
    });

    await createPeriods({
      workspaceId,
      userProperties,
      segments,
      now,
      periodByComputedPropertyId,
      step: ComputedPropertyStep.ProcessAssignments,
    });
  });
}
