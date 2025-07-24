import { and, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  CreateWorkspaceMemberRoleRequest,
  DeleteWorkspaceMemberRoleRequest,
  GetWorkspaceMemberRolesRequest,
  GetWorkspaceMemberRolesResponse,
  UpdateWorkspaceMemberRoleRequest,
  WorkspaceMemberRoleResource,
  WorkspaceMemberWithRoles,
} from "isomorphic-lib/src/types";

import { db, insert } from "./db";
import * as schema from "./db/schema";
import { WorkspaceMember } from "./types";

export async function getWorkspaceMemberRoles({
  workspaceId,
}: GetWorkspaceMemberRolesRequest): Promise<GetWorkspaceMemberRolesResponse> {
  const memberRoles = await db()
    .select({
      member: {
        id: schema.workspaceMember.id,
        email: schema.workspaceMember.email,
        emailVerified: schema.workspaceMember.emailVerified,
        image: schema.workspaceMember.image,
        name: schema.workspaceMember.name,
        nickname: schema.workspaceMember.nickname,
        createdAt: schema.workspaceMember.createdAt,
      },
      role: {
        role: schema.workspaceMemberRole.role,
        workspaceMemberId: schema.workspaceMemberRole.workspaceMemberId,
        workspaceId: schema.workspaceMemberRole.workspaceId,
        workspaceName: schema.workspace.name,
      },
    })
    .from(schema.workspaceMemberRole)
    .innerJoin(
      schema.workspaceMember,
      eq(
        schema.workspaceMemberRole.workspaceMemberId,
        schema.workspaceMember.id,
      ),
    )
    .innerJoin(
      schema.workspace,
      eq(schema.workspaceMemberRole.workspaceId, schema.workspace.id),
    )
    .where(eq(schema.workspaceMemberRole.workspaceId, workspaceId));

  const memberRoleMap = new Map<string, WorkspaceMemberWithRoles>();

  for (const row of memberRoles) {
    const memberId = row.member.id;
    if (!memberRoleMap.has(memberId)) {
      memberRoleMap.set(memberId, {
        member: {
          id: row.member.id,
          email: row.member.email ?? "",
          emailVerified: row.member.emailVerified,
          picture: row.member.image ?? undefined,
          name: row.member.name ?? undefined,
          nickname: row.member.nickname ?? undefined,
          createdAt: row.member.createdAt.toISOString(),
        },
        roles: [],
      });
    }
    const member = memberRoleMap.get(memberId);
    if (member) {
      member.roles.push(row.role);
    }
  }

  return {
    memberRoles: Array.from(memberRoleMap.values()),
  };
}

export async function createWorkspaceMemberRole({
  workspaceId,
  email,
  role,
}: CreateWorkspaceMemberRoleRequest): Promise<WorkspaceMemberRoleResource> {
  const workspace = await db().query.workspace.findFirst({
    where: eq(schema.workspace.id, workspaceId),
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  // Find or create workspace member
  let workspaceMember: WorkspaceMember;
  const maybeWorkspaceMember = await db().query.workspaceMember.findFirst({
    where: eq(schema.workspaceMember.email, email),
  });

  if (maybeWorkspaceMember) {
    workspaceMember = maybeWorkspaceMember;
  } else {
    workspaceMember = unwrap(
      await insert({
        table: schema.workspaceMember,
        doNothingOnConflict: true,
        lookupExisting: eq(schema.workspaceMember.email, email),
        values: {
          email,
        },
      }),
    );
  }

  // Check if role already exists
  const existingRole = await db().query.workspaceMemberRole.findFirst({
    where: and(
      eq(schema.workspaceMemberRole.workspaceId, workspaceId),
      eq(schema.workspaceMemberRole.workspaceMemberId, workspaceMember.id),
    ),
  });

  if (existingRole) {
    throw new Error("Member already has a role in this workspace");
  }

  await db().insert(schema.workspaceMemberRole).values({
    workspaceId,
    workspaceMemberId: workspaceMember.id,
    role,
  });

  return {
    role,
    workspaceMemberId: workspaceMember.id,
    workspaceId,
    workspaceName: workspace.name,
  };
}

export async function updateWorkspaceMemberRole({
  workspaceId,
  email,
  role,
}: UpdateWorkspaceMemberRoleRequest): Promise<WorkspaceMemberRoleResource> {
  const workspace = await db().query.workspace.findFirst({
    where: eq(schema.workspace.id, workspaceId),
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const workspaceMember = await db().query.workspaceMember.findFirst({
    where: eq(schema.workspaceMember.email, email),
  });

  if (!workspaceMember) {
    throw new Error("Workspace member not found");
  }

  const existingRole = await db().query.workspaceMemberRole.findFirst({
    where: and(
      eq(schema.workspaceMemberRole.workspaceId, workspaceId),
      eq(schema.workspaceMemberRole.workspaceMemberId, workspaceMember.id),
    ),
  });

  if (!existingRole) {
    throw new Error("Member role not found");
  }

  await db()
    .update(schema.workspaceMemberRole)
    .set({ role })
    .where(
      and(
        eq(schema.workspaceMemberRole.workspaceId, workspaceId),
        eq(schema.workspaceMemberRole.workspaceMemberId, workspaceMember.id),
      ),
    );

  return {
    role,
    workspaceMemberId: workspaceMember.id,
    workspaceId,
    workspaceName: workspace.name,
  };
}

export async function deleteWorkspaceMemberRole({
  workspaceId,
  email,
}: DeleteWorkspaceMemberRoleRequest): Promise<boolean> {
  const workspaceMember = await db().query.workspaceMember.findFirst({
    where: eq(schema.workspaceMember.email, email),
  });

  if (!workspaceMember) {
    return false;
  }

  const result = await db()
    .delete(schema.workspaceMemberRole)
    .where(
      and(
        eq(schema.workspaceMemberRole.workspaceId, workspaceId),
        eq(schema.workspaceMemberRole.workspaceMemberId, workspaceMember.id),
      ),
    );

  return (result.rowCount ?? 0) > 0;
}
