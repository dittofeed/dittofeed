import logger from "backend-lib/src/logger";
import prisma, { Prisma } from "backend-lib/src/prisma";
import { SubscriptionGroup, Workspace } from "backend-lib/src/types";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  SegmentDefinition,
  SegmentNode,
  SegmentNodeType,
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
  subscriptionGroups,
  destinationSubscriptionGroups,
  workspace,
  destinationWorkspace,
}: {
  node: SegmentNode;
  subscriptionGroups: SubscriptionGroup[];
  destinationSubscriptionGroups: SubscriptionGroup[];
  workspace: Workspace;
  destinationWorkspace: Workspace;
}): SegmentNode {
  if (node.type === SegmentNodeType.SubscriptionGroup) {
    const existingSubscriptionGroup = subscriptionGroups.find(
      (sg) => sg.id === node.subscriptionGroupId,
    );
    if (!existingSubscriptionGroup) {
      logger().error({ node }, "Subscription group not found");
      throw new Error("Subscription group not found");
    }
    const newSubscriptionGroup = destinationSubscriptionGroups.find(
      (sg) =>
        sg.name ===
        newSubscriptionGroupName({
          name: existingSubscriptionGroup.name,
          workspaceName: workspace.name,
          destinationWorkspaceName: destinationWorkspace.name,
        }),
    );
    if (!newSubscriptionGroup) {
      logger().error({ node }, "Destination subscription group not found");
      throw new Error("Destination subscription group not found");
    }
    return {
      ...node,
      subscriptionGroupId: newSubscriptionGroup.id,
    };
  }
  return node;
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
            id: uuidv5(template.id, destinationWorkspaceId),
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

    const destinationSubscriptionGroups = await Promise.all(
      subscriptionGroups.map((sg) => {
        const newName = newSubscriptionGroupName({
          name: sg.name,
          workspaceName: workspace.name,
          destinationWorkspaceName: destinationWorkspace.name,
        });
        const data = {
          ...sg,
          id: uuidv5(sg.id, destinationWorkspaceId),
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

    await Promise.all(
      segments.map((segment) => {
        const definition = unwrap(
          schemaValidate(segment.definition, SegmentDefinition),
        );
        const newDefinition = {
          entryNode: mapSegmentNode({
            node: definition.entryNode,
            subscriptionGroups,
            destinationSubscriptionGroups,
            workspace,
            destinationWorkspace,
          }),
          nodes: definition.nodes.map((node) =>
            mapSegmentNode({
              node,
              subscriptionGroups,
              destinationSubscriptionGroups,
              workspace,
              destinationWorkspace,
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
            id: uuidv5(segment.id, destinationWorkspaceId),
            definition: newDefinition,
            workspaceId: destinationWorkspaceId,
          },
          update: {},
        });
      }),
    );
  });
}
