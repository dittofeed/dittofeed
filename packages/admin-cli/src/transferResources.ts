import logger from "backend-lib/src/logger";
import prisma, { Prisma } from "backend-lib/src/prisma";
import { getUnsafe } from "isomorphic-lib/src/maps";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  EntryNode,
  JourneyBodyNode,
  JourneyDefinition,
  JourneyNodeType,
  MessageNode,
  SegmentDefinition,
  SegmentEntryNode,
  SegmentNode,
  SegmentNodeType,
  SegmentOperator,
  SegmentOperatorType,
  SegmentSplitNode,
  WaitForNode,
} from "isomorphic-lib/src/types";
import { v5 as uuidv5 } from "uuid";

function newSubscriptionGroupName({
  name,
  workspaceName,
  destinationWorkspaceName,
}: {
  name: string;
  workspaceName: string;
  destinationWorkspaceName: string;
}): string {
  return name.replace(workspaceName, destinationWorkspaceName);
}

function mapProperty({
  path,
  value,
  templateMap,
  segmentMap,
  userPropertyMap,
  subscriptionGroupMap,
}: {
  path: string;
  value: string;
  templateMap: Map<string, string>;
  segmentMap: Map<string, string>;
  userPropertyMap: Map<string, string>;
  subscriptionGroupMap: Map<string, string>;
}): string {
  switch (path) {
    case "templateId":
      return getUnsafe(templateMap, value);
    case "segmentId":
      return getUnsafe(segmentMap, value);
    case "userPropertyId":
      return getUnsafe(userPropertyMap, value);
    case "subscriptionGroupId":
      return getUnsafe(subscriptionGroupMap, value);
    default: {
      return value;
    }
  }
}

function mapSegmentOperator({
  operator,
  path,
  templateMap,
  segmentMap,
  userPropertyMap,
  subscriptionGroupMap,
}: {
  operator: SegmentOperator;
  path: string;
  templateMap: Map<string, string>;
  segmentMap: Map<string, string>;
  userPropertyMap: Map<string, string>;
  subscriptionGroupMap: Map<string, string>;
}): SegmentOperator {
  switch (operator.type) {
    case SegmentOperatorType.Equals:
      if (typeof operator.value === "number") {
        return operator;
      }
      return {
        ...operator,
        value: mapProperty({
          path,
          value: operator.value,
          templateMap,
          segmentMap,
          userPropertyMap,
          subscriptionGroupMap,
        }),
      };
    case SegmentOperatorType.NotEquals:
      if (typeof operator.value === "number") {
        return operator;
      }
      return {
        ...operator,
        value: mapProperty({
          path,
          value: operator.value,
          templateMap,
          segmentMap,
          userPropertyMap,
          subscriptionGroupMap,
        }),
      };
    case SegmentOperatorType.HasBeen:
      if (typeof operator.value === "number") {
        return operator;
      }
      return {
        ...operator,
        value: mapProperty({
          path,
          value: operator.value,
          templateMap,
          segmentMap,
          userPropertyMap,
          subscriptionGroupMap,
        }),
      };
    case SegmentOperatorType.Within:
      return operator;
    case SegmentOperatorType.Exists:
      return operator;
  }
}

function mapSegmentNode({
  node,
  subscriptionGroupMap,
  segmentMap,
  templateMap,
  userPropertyMap,
}: {
  node: SegmentNode;
  subscriptionGroupMap: Map<string, string>;
  segmentMap: Map<string, string>;
  templateMap: Map<string, string>;
  userPropertyMap: Map<string, string>;
}): SegmentNode {
  switch (node.type) {
    case SegmentNodeType.SubscriptionGroup:
      return {
        ...node,
        subscriptionGroupId: getUnsafe(
          subscriptionGroupMap,
          node.subscriptionGroupId,
        ),
      };
    case SegmentNodeType.Email:
      return {
        ...node,
        templateId: getUnsafe(templateMap, node.templateId),
      };
    case SegmentNodeType.Performed:
      return {
        ...node,
        properties: node.properties?.map((property) => ({
          ...property,
          operator: mapSegmentOperator({
            operator: property.operator,
            path: property.path,
            templateMap,
            segmentMap,
            userPropertyMap,
            subscriptionGroupMap,
          }),
        })),
      };
    default:
      return node;
  }
}

function mapJourneyEntryNode({
  node,
  segmentMap,
}: {
  node: EntryNode;
  segmentMap: Map<string, string>;
}): EntryNode {
  switch (node.type) {
    case JourneyNodeType.EventEntryNode:
      return node;
    case JourneyNodeType.SegmentEntryNode:
      return {
        ...node,
        segment: getUnsafe(segmentMap, node.segment),
      } satisfies SegmentEntryNode;
  }
}

function mapJourneyBodyNode({
  node,
  subscriptionGroupMap,
  segmentMap,
  templateMap,
}: {
  node: JourneyBodyNode;
  subscriptionGroupMap: Map<string, string>;
  segmentMap: Map<string, string>;
  templateMap: Map<string, string>;
}): JourneyBodyNode {
  switch (node.type) {
    case JourneyNodeType.DelayNode:
      return node;
    case JourneyNodeType.MessageNode:
      return {
        ...node,
        subscriptionGroupId: node.subscriptionGroupId
          ? getUnsafe(subscriptionGroupMap, node.subscriptionGroupId)
          : undefined,
        variant: {
          ...node.variant,
          templateId: getUnsafe(templateMap, node.variant.templateId),
        },
      } satisfies MessageNode;
    case JourneyNodeType.SegmentSplitNode: {
      const { variant } = node;

      return {
        ...node,
        variant: {
          ...variant,
          trueChild: getUnsafe(segmentMap, node.variant.trueChild),
          falseChild: getUnsafe(segmentMap, node.variant.falseChild),
        },
      } satisfies SegmentSplitNode;
    }
    case JourneyNodeType.WaitForNode:
      return {
        ...node,
        segmentChildren: node.segmentChildren.map((child) => ({
          ...child,
          segment: getUnsafe(segmentMap, child.segmentId),
        })),
      } satisfies WaitForNode;
    case JourneyNodeType.ExperimentSplitNode:
      throw new Error("Not implemented");
    case JourneyNodeType.RateLimitNode:
      throw new Error("Not implemented");
  }
}

// yarn admin transfer-resources --workspace-id='{workspaceId}' --destination-workspace-id='{destinationWorkspaceId}'
export async function transferResources({
  workspaceId,
  destinationWorkspaceId,
}: {
  workspaceId: string;
  destinationWorkspaceId: string;
}): Promise<void> {
  logger().info(
    {
      workspaceId,
      destinationWorkspaceId,
    },
    "Transferring resources for workspace",
  );

  const [workspace, destinationWorkspace] = await Promise.all([
    prisma().workspace.findUniqueOrThrow({
      where: {
        id: workspaceId,
      },
    }),
    prisma().workspace.findUniqueOrThrow({
      where: {
        id: destinationWorkspaceId,
      },
    }),
  ]);

  await prisma().$transaction(async (tx) => {
    const userProperties = await tx.userProperty.findMany({
      where: {
        workspaceId,
      },
    });
    logger().info(
      {
        count: userProperties.length,
      },
      "Transferring user properties",
    );
    const userPropertyMap = userProperties.reduce((acc, userProperty) => {
      acc.set(userProperty.id, uuidv5(userProperty.id, destinationWorkspaceId));
      return acc;
    }, new Map<string, string>());

    await Promise.all(
      userProperties.map((userProperty) =>
        tx.userProperty.upsert({
          where: {
            workspaceId_name: {
              workspaceId: destinationWorkspaceId,
              name: userProperty.name,
            },
          },
          create: {
            ...userProperty,
            definition: userProperty.definition ?? Prisma.JsonNull,
            id: getUnsafe(userPropertyMap, userProperty.id),
            workspaceId: destinationWorkspaceId,
          },
          update: {},
        }),
      ),
    );

    const templates = await tx.messageTemplate.findMany({
      where: {
        workspaceId,
      },
    });
    logger().info(
      {
        count: templates.length,
      },
      "Transferring message templates",
    );
    const templateMap = templates.reduce((acc, template) => {
      acc.set(template.id, uuidv5(template.id, destinationWorkspaceId));
      return acc;
    }, new Map<string, string>());

    await Promise.all(
      templates.map((template) =>
        tx.messageTemplate.upsert({
          where: {
            workspaceId_name: {
              workspaceId: destinationWorkspaceId,
              name: template.name,
            },
          },
          create: {
            ...template,
            id: getUnsafe(templateMap, template.id),
            definition: template.definition ?? Prisma.DbNull,
            draft: template.draft ?? Prisma.DbNull,
            workspaceId: destinationWorkspaceId,
          },
          update: {},
        }),
      ),
    );
    const subscriptionGroups = await tx.subscriptionGroup.findMany({
      where: {
        workspaceId,
      },
    });
    const subscriptionGroupMap = subscriptionGroups.reduce((acc, sg) => {
      acc.set(sg.id, uuidv5(sg.id, destinationWorkspaceId));
      return acc;
    }, new Map<string, string>());

    logger().info(
      {
        count: subscriptionGroups.length,
      },
      "Transferring subscription groups",
    );

    await Promise.all(
      subscriptionGroups.map((sg) => {
        const newName = newSubscriptionGroupName({
          name: sg.name,
          workspaceName: workspace.name,
          destinationWorkspaceName: destinationWorkspace.name,
        });
        const data = {
          ...sg,
          id: getUnsafe(subscriptionGroupMap, sg.id),
          workspaceId: destinationWorkspaceId,
          name: newName,
        };
        return tx.subscriptionGroup.upsert({
          where: {
            workspaceId_name: {
              workspaceId: destinationWorkspaceId,
              name: newName,
            },
          },
          create: data,
          update: data,
        });
      }),
    );

    const segments = await tx.segment.findMany({
      where: {
        workspaceId,
      },
    });

    const segmentMap = segments.reduce((acc, segment) => {
      acc.set(segment.id, uuidv5(segment.id, destinationWorkspaceId));
      return acc;
    }, new Map<string, string>());

    logger().info(
      {
        count: segments.length,
      },
      "Transferring segments",
    );

    await Promise.all(
      segments.map((segment) => {
        const definition = unwrap(
          schemaValidate(segment.definition, SegmentDefinition),
        );
        const newDefinition = {
          entryNode: mapSegmentNode({
            node: definition.entryNode,
            subscriptionGroupMap,
            segmentMap,
            templateMap,
            userPropertyMap,
          }),
          nodes: definition.nodes.map((node) =>
            mapSegmentNode({
              node,
              subscriptionGroupMap,
              segmentMap,
              templateMap,
              userPropertyMap,
            }),
          ),
        };

        return tx.segment.upsert({
          where: {
            workspaceId_name: {
              workspaceId: destinationWorkspaceId,
              name: segment.name,
            },
          },
          create: {
            ...segment,
            id: getUnsafe(segmentMap, segment.id),
            definition: newDefinition,
            workspaceId: destinationWorkspaceId,
          },
          update: {},
        });
      }),
    );

    const journeys = await tx.journey.findMany({
      where: {
        workspaceId,
      },
    });

    const journeyMap = journeys.reduce((acc, journey) => {
      acc.set(journey.id, uuidv5(journey.id, destinationWorkspaceId));
      return acc;
    }, new Map<string, string>());

    logger().info(
      {
        count: journeys.length,
      },
      "Transferring journeys",
    );

    await Promise.all(
      journeys.flatMap((journey) => {
        if (!journey.definition) {
          logger().warn(
            {
              journeyId: journey.id,
              journeyName: journey.name,
            },
            "Journey has no definition, skipping.",
          );
          return [];
        }
        const definition = unwrap(
          schemaValidate(journey.definition, JourneyDefinition),
        );
        const newDefinition = {
          entryNode: mapJourneyEntryNode({
            node: definition.entryNode,
            segmentMap,
          }),
          nodes: definition.nodes.map((node) =>
            mapJourneyBodyNode({
              node,
              subscriptionGroupMap,
              segmentMap,
              templateMap,
            }),
          ),
          exitNode: definition.exitNode,
        } satisfies JourneyDefinition;

        return tx.journey.upsert({
          where: {
            workspaceId_name: {
              workspaceId: destinationWorkspaceId,
              name: journey.name,
            },
          },
          create: {
            ...journey,
            id: getUnsafe(journeyMap, journey.id),
            status: "Paused",
            draft: Prisma.DbNull,
            definition: newDefinition,
            workspaceId: destinationWorkspaceId,
          },
          update: {},
        });
      }),
    );
  });
}
