import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import backendConfig from "backend-lib/src/config";
import {
  getMemberProfileWorkspaces,
  setOwnWorkspaceMemberPassword,
} from "backend-lib/src/rbac";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AuthMePasswordRequest,
  AuthMeProfileResponse,
  BadRequestResponse,
  EmptyResponse,
} from "isomorphic-lib/src/types";

function denyUnlessMultiTenant(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (backendConfig().authMode !== "multi-tenant") {
    void reply.status(404).send();
    return true;
  }
  const member = request.requestContext.get("member");
  if (!member) {
    void reply.status(401).send();
    return true;
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/require-await
export default async function multiTenantAuthController(
  fastify: FastifyInstance,
) {
  if (backendConfig().authMode !== "multi-tenant") {
    return;
  }

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/me/profile",
    {
      schema: {
        description: "Current member profile, workspaces, and password flag.",
        tags: ["Auth"],
        response: {
          200: AuthMeProfileResponse,
          401: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (denyUnlessMultiTenant(request, reply)) {
        return;
      }
      const member = request.requestContext.get("member")!;
      const profile = await getMemberProfileWorkspaces(member.id);
      return reply.status(200).send(profile);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/me/password",
    {
      schema: {
        description: "Set or change password for the signed-in member.",
        tags: ["Auth"],
        body: AuthMePasswordRequest,
        response: {
          204: EmptyResponse,
          400: EmptyResponse,
          401: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (denyUnlessMultiTenant(request, reply)) {
        return;
      }
      if (request.body.newPassword !== request.body.newPasswordConfirm) {
        return reply.status(400).send({
          message: "New passwords do not match.",
        } as never);
      }
      const member = request.requestContext.get("member")!;
      const rawCurrent = request.body.currentPassword;
      const currentPassword =
        rawCurrent === undefined || rawCurrent === null
          ? undefined
          : rawCurrent;
      try {
        await setOwnWorkspaceMemberPassword({
          memberId: member.id,
          currentPassword,
          newPassword: request.body.newPassword,
        });
      } catch (error) {
        if (error instanceof Error) {
          if (
            error.message.includes("Current password") ||
            error.message.includes("at least") ||
            error.message.includes("too long")
          ) {
            return reply.status(400).send({
              message: error.message,
            } as never);
          }
        }
        throw error;
      }
      return reply.status(204).send();
    },
  );
}
