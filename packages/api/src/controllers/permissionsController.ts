import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { FastifyInstance } from "fastify";
import {
  CreateWorkspaceMemberRoleRequest,
  UpdateWorkspaceMemberRoleRequest,
  DeleteWorkspaceMemberRoleRequest,
  GetWorkspaceMemberRolesRequest,
  GetWorkspaceMemberRolesResponse,
  WorkspaceMemberRoleResource,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import {
  getWorkspaceMemberRoles,
  createWorkspaceMemberRole,
  updateWorkspaceMemberRole,
  deleteWorkspaceMemberRole,
} from "backend-lib/src/rbac";

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
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
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
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
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
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const success = await deleteWorkspaceMemberRole(request.body);
      if (!success) {
        return reply.status(404).send();
      }
      return reply.status(204).send();
    },
  );
}