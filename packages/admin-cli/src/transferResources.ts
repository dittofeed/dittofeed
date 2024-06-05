import logger from "backend-lib/src/logger";
import prisma, { Prisma } from "backend-lib/src/prisma";
import { SubscriptionGroup, Workspace } from "backend-lib/src/types";
import { getUnsafe } from "isomorphic-lib/src/maps";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  EntryNode,
  JourneyBodyNode,
  JourneyDefinition,
  JourneyNode,
  JourneyNodeType,
  MessageNode,
  SegmentDefinition,
  SegmentEntryNode,
  SegmentNode,
  SegmentNodeType,
  SegmentSplitNode,
  SegmentSplitVariantType,
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

function mapSegmentNode({
  node,
  subscriptionGroupMap,
}: {
  node: SegmentNode;
  subscriptionGroupMap: Map<string, string>;
}): SegmentNode {
  if (node.type === SegmentNodeType.SubscriptionGroup) {
    return {
      ...node,
      subscriptionGroupId: getUnsafe(
        subscriptionGroupMap,
        node.subscriptionGroupId,
      ),
    };
  }
  return node;
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

// yarn admin bootstrap --workspace-name='Destination'
// yarn admin transfer-resources --workspace-id='5c89ccd5-bd30-4af3-94fa-c7e1ea869307' --destination-workspace-id='0ae1dc72-4e8f-4f1c-bd54-0762235d7134'
// delete from "SubscriptionGroup" where id in ('78084cae-e680-5de4-8345-e04ea73d76b6', '873aa85a-e0da-583b-b3ba-1b139379810f', 'b4f2a360-5606-59c6-a8fa-f73f11f4dcb7');
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

  logger().info("Transferring message templates");
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
          }),
          nodes: definition.nodes.map((node) =>
            mapSegmentNode({
              node,
              subscriptionGroupMap,
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
      journeys.map((journey) => {
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
            draft: journey.draft ?? Prisma.DbNull,
            definition: newDefinition,
            workspaceId: destinationWorkspaceId,
          },
          update: {},
        });
      }),
    );
  });
}
