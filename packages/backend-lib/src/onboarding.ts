import { err, ok, Result } from "neverthrow";

import logger from "./logger";
import prisma from "./prisma";

export async function onboardUser({
  email,
  workspaceName,
}: {
  email: string;
  workspaceName: string;
}): Promise<Result<null, Error>> {
  const [workspaceMember, workspaces] = await Promise.all([
    prisma().workspaceMember.findUnique({ where: { email } }),
    prisma().workspace.findMany({ where: { name: workspaceName } }),
  ]);

  if (!workspaceMember) {
    return err(new Error("User not found"));
  }

  const workspace = workspaces[0];
  if (!workspace) {
    return err(new Error("Workspace not found"));
  }

  if (workspaces.length > 1) {
    return err(new Error("workspaceName is not unique"));
  }

  logger().info(
    {
      workspaceMember,
      workspace,
    },
    "assigning role to workspace member",
  );

  await prisma().workspaceMemberRole.upsert({
    where: {
      workspaceId_workspaceMemberId: {
        workspaceId: workspace.id,
        workspaceMemberId: workspaceMember.id,
      },
    },
    update: {
      workspaceId: workspace.id,
      workspaceMemberId: workspaceMember.id,
      role: "Admin",
    },
    create: {
      workspaceId: workspace.id,
      workspaceMemberId: workspaceMember.id,
      role: "Admin",
    },
  });
  return ok(null);
}
