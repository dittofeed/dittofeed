import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { err, ok, Result } from "neverthrow";

import { db, insert } from "./db";
import {
  workspace as dbWorkspace,
  workspaceMember as dbWorkspaceMember,
  workspaceMemberRole as dbWorkspaceMemberRole,
} from "./db/schema";
import logger from "./logger";
import { WorkspaceMember } from "./types";

export async function onboardUser({
  email,
  workspaceName,
}: {
  email: string;
  workspaceName: string;
}): Promise<Result<null, Error>> {
  const [maybeWorkspaceMember, workspaces] = await Promise.all([
    db().query.workspaceMember.findFirst({
      where: eq(dbWorkspaceMember.email, email),
    }),
    db().query.workspace.findMany({
      where: eq(dbWorkspace.name, workspaceName),
    }),
  ]);

  let workspaceMember: WorkspaceMember;
  if (maybeWorkspaceMember) {
    workspaceMember = maybeWorkspaceMember;
  } else {
    workspaceMember = unwrap(
      await insert({
        table: dbWorkspaceMember,
        values: {
          email,
          id: randomUUID(),
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      }),
    );
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

  await db()
    .insert(dbWorkspaceMemberRole)
    .values({
      workspaceId: workspace.id,
      workspaceMemberId: workspaceMember.id,
      role: "Admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [
        dbWorkspaceMemberRole.workspaceId,
        dbWorkspaceMemberRole.workspaceMemberId,
      ],
      set: { role: "Admin" },
    });

  return ok(null);
}
