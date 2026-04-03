import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import backendConfig from "backend-lib/src/config";
import { createWorkspaceFromDashboard } from "backend-lib/src/workspaces/createWorkspaceFromDashboard";
import { FastifyInstance } from "fastify";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  CreateWorkspaceError,
  CreateWorkspaceErrorType,
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  EmptyResponse,
  RoleEnum,
} from "isomorphic-lib/src/types";

import { denyUnlessAtLeastRole } from "../buildApp/workspaceRoleGuard";

function mapCreateWorkspaceErrorToStatus(error: CreateWorkspaceError): number {
  switch (error.type) {
    case CreateWorkspaceErrorType.WorkspaceAlreadyExists:
      return 409;
    case CreateWorkspaceErrorType.WorkspaceNameViolation:
    case CreateWorkspaceErrorType.InvalidDomain:
      return 400;
    default:
      assertUnreachable(error);
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
export default async function workspacesController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/",
    {
      schema: {
        description:
          "Create a new Root workspace. Multi-tenant only; caller must be Admin in the active workspace. Creator is granted Admin in the new workspace.",
        tags: ["Workspaces"],
        body: CreateWorkspaceRequest,
        response: {
          201: CreateWorkspaceResponse,
          400: EmptyResponse,
          403: EmptyResponse,
          409: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (backendConfig().authMode !== "multi-tenant") {
        return reply.status(403).send();
      }

      const workspace = request.requestContext.get("workspace");
      const member = request.requestContext.get("member");

      if (!workspace?.id || !member?.email) {
        return reply.status(403).send();
      }

      if (denyUnlessAtLeastRole(request, reply, RoleEnum.Admin)) {
        return;
      }

      const result = await createWorkspaceFromDashboard({
        workspaceName: request.body.name,
        workspaceDomain: request.body.domain,
        creatorEmail: member.email,
      });

      if (result.isErr()) {
        const { error } = result;
        return reply.status(mapCreateWorkspaceErrorToStatus(error)).send();
      }

      return reply.status(201).send(result.value);
    },
  );
}
