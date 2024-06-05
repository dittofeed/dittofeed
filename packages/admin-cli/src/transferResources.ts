import logger from "backend-lib/src/logger";
import prisma, { Prisma } from "backend-lib/src/prisma";

// yarn admin bootstrap --workspace-name='Destination'
// yarn admin transfer-resources --workspace-id='5c89ccd5-bd30-4af3-94fa-c7e1ea869307' --destination-workspace-id='0ae1dc72-4e8f-4f1c-bd54-0762235d7134'
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
            definition: template.definition ?? Prisma.DbNull,
            draft: template.draft ?? Prisma.DbNull,
            workspaceId: destinationWorkspaceId,
          },
          update: {},
        }),
      ),
    );
  });
}
