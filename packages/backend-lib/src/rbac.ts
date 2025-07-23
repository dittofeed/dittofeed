import { db } from "./db";
import * as schema from "./db/schema";
import { eq, and } from "drizzle-orm";
import {
  CreateWorkspaceMemberRoleRequest,
  UpdateWorkspaceMemberRoleRequest,
  DeleteWorkspaceMemberRoleRequest,
  GetWorkspaceMemberRolesRequest,
  GetWorkspaceMemberRolesResponse,
  WorkspaceMemberWithRoles,
  WorkspaceMemberResource,
  WorkspaceMemberRoleResource,
  Role,
} from "isomorphic-lib/src/types";

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
      eq(schema.workspaceMemberRole.workspaceMemberId, schema.workspaceMember.id)
    )
    .innerJoin(
      schema.workspace,
      eq(schema.workspaceMemberRole.workspaceId, schema.workspace.id)
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
    memberRoleMap.get(memberId)!.roles.push(row.role);
  }

  return {
    memberRoles: Array.from(memberRoleMap.values()),
  };
}

export async function createWorkspaceMemberRole({
  workspaceId,
  memberId,
  role,
}: CreateWorkspaceMemberRoleRequest): Promise<WorkspaceMemberRoleResource> {
  const workspace = await db().query.workspace.findFirst({
    where: eq(schema.workspace.id, workspaceId),
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const member = await db().query.workspaceMember.findFirst({
    where: eq(schema.workspaceMember.id, memberId),
  });

  if (!member) {
    throw new Error("Workspace member not found");
  }

  const existingRole = await db().query.workspaceMemberRole.findFirst({
    where: and(
      eq(schema.workspaceMemberRole.workspaceId, workspaceId),
      eq(schema.workspaceMemberRole.workspaceMemberId, memberId)
    ),
  });

  if (existingRole) {
    throw new Error("Member already has a role in this workspace");
  }

  await db().insert(schema.workspaceMemberRole).values({
    workspaceId,
    workspaceMemberId: memberId,
    role,
  });

  return {
    role,
    workspaceMemberId: memberId,
    workspaceId,
    workspaceName: workspace.name,
  };
}

export async function updateWorkspaceMemberRole({
  workspaceId,
  memberId,
  role,
}: UpdateWorkspaceMemberRoleRequest): Promise<WorkspaceMemberRoleResource> {
  const workspace = await db().query.workspace.findFirst({
    where: eq(schema.workspace.id, workspaceId),
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const existingRole = await db().query.workspaceMemberRole.findFirst({
    where: and(
      eq(schema.workspaceMemberRole.workspaceId, workspaceId),
      eq(schema.workspaceMemberRole.workspaceMemberId, memberId)
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
        eq(schema.workspaceMemberRole.workspaceMemberId, memberId)
      )
    );

  return {
    role,
    workspaceMemberId: memberId,
    workspaceId,
    workspaceName: workspace.name,
  };
}

export async function deleteWorkspaceMemberRole({
  workspaceId,
  memberId,
}: DeleteWorkspaceMemberRoleRequest): Promise<boolean> {
  const result = await db()
    .delete(schema.workspaceMemberRole)
    .where(
      and(
        eq(schema.workspaceMemberRole.workspaceId, workspaceId),
        eq(schema.workspaceMemberRole.workspaceMemberId, memberId)
      )
    );

  return (result.rowCount ?? 0) > 0;
}