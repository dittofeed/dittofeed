import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import backendConfig from "backend-lib/src/config";
import {
  adminSetWorkspaceMemberPassword,
  createWorkspaceMemberRole,
  deleteWorkspaceMemberRole,
  getWorkspaceMemberRoles,
  updateWorkspaceMemberRole,
} from "backend-lib/src/rbac";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AdminWorkspaceMemberPasswordRequest,
  CreateWorkspaceMemberRoleRequest,
  DeleteWorkspaceMemberRoleRequest,
  EmptyResponse,
  GetWorkspaceMemberRolesRequest,
  GetWorkspaceMemberRolesResponse,
  UpdateWorkspaceMemberRoleRequest,
  WorkspaceMemberRoleResource,
} from "isomorphic-lib/src/types";
import { requireWorkspaceAdmin } from "isomorphic-lib/src/workspaceRoles";

function denyUnlessWorkspaceAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  workspaceId: string,
): boolean {
  if (backendConfig().authMode !== "multi-tenant") {
    return false;
  }
  const memberRoles = request.requestContext.get("memberRoles") ?? [];
  if (requireWorkspaceAdmin({ memberRoles, workspaceId }).isErr()) {
    void reply.status(403).send();
    return true;
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/require-await
export default async function permissionsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get all workspace member roles.",
        tags: ["Permissions"],
        querystring: GetWorkspaceMemberRolesRequest,
        response: {
          200: GetWorkspaceMemberRolesResponse,
        },
      },
    },
    async (request, reply) => {
      const memberRoles = await getWorkspaceMemberRoles(request.query);
      return reply.status(200).send(memberRoles);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/",
    {
      schema: {
        description: "Create a new workspace member role.",
        tags: ["Permissions"],
        body: CreateWorkspaceMemberRoleRequest,
        response: {
          201: WorkspaceMemberRoleResource,
          400: EmptyResponse,
          403: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (denyUnlessWorkspaceAdmin(request, reply, request.body.workspaceId)) {
        return;
      }
      try {
        const role = await createWorkspaceMemberRole(request.body);
        return reply.status(201).send(role);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("not found")) {
            return reply.status(404).send();
          }
          if (error.message.includes("already has a role")) {
            return reply.status(400).send();
          }
        }
        throw error;
      }
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Update a workspace member role.",
        tags: ["Permissions"],
        body: UpdateWorkspaceMemberRoleRequest,
        response: {
          200: WorkspaceMemberRoleResource,
          403: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (denyUnlessWorkspaceAdmin(request, reply, request.body.workspaceId)) {
        return;
      }
      try {
        const role = await updateWorkspaceMemberRole(request.body);
        return reply.status(200).send(role);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.status(404).send();
        }
        throw error;
      }
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description: "Delete a workspace member role.",
        tags: ["Permissions"],
        body: DeleteWorkspaceMemberRoleRequest,
        response: {
          204: EmptyResponse,
          403: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (denyUnlessWorkspaceAdmin(request, reply, request.body.workspaceId)) {
        return;
      }
      const success = await deleteWorkspaceMemberRole(request.body);
      if (!success) {
        return reply.status(404).send();
      }
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/member-password",
    {
      schema: {
        description: "Set or reset password for a member in the workspace.",
        tags: ["Permissions"],
        body: AdminWorkspaceMemberPasswordRequest,
        response: {
          204: EmptyResponse,
          400: EmptyResponse,
          403: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (denyUnlessWorkspaceAdmin(request, reply, request.body.workspaceId)) {
        return;
      }
      if (request.body.newPassword !== request.body.newPasswordConfirm) {
        return reply.status(400).send();
      }
      try {
        await adminSetWorkspaceMemberPassword({
          workspaceId: request.body.workspaceId,
          email: request.body.email,
          newPassword: request.body.newPassword,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.status(404).send();
        }
        if (
          error instanceof Error &&
          (error.message.includes("at least") ||
            error.message.includes("too long"))
        ) {
          return reply.status(400).send();
        }
        throw error;
      }
      return reply.status(204).send();
    },
  );
}
