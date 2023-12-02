import prisma from "./prisma";

export async function getFeature({
  name,
  workspaceId,
}: {
  workspaceId: string;
  name: string;
}): Promise<boolean> {
  const feature = await prisma().feature.findUnique({
    where: {
      workspaceId_name: {
        workspaceId,
        name,
      },
    },
  });
  return feature?.enabled ?? false;
}
