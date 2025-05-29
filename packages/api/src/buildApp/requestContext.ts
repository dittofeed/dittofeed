import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { getRequestContext, SESSION_KEY } from "backend-lib/src/requestContext";
import {
  DBWorkspaceOccupantType,
  EmbeddedSession,
  OpenIdProfile,
  RequestContextErrorType,
} from "backend-lib/src/types";
import { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { getWorkspaceId } from "../workspace";

export function requestToSessionValue(request: FastifyRequest):
  | {
      [SESSION_KEY]: "true" | "false";
    }
  | undefined {
  if (backendConfig().authMode !== "single-tenant") {
    return undefined;
  }

  const hasSession = request.session.get(SESSION_KEY) === true;
  return { [SESSION_KEY]: hasSession ? "true" : "false" };
}

export function getRequestContextFastify(request: FastifyRequest) {
  const headers = {
    ...request.headers,
    ...requestToSessionValue(request),
  };
  const { user: profile } = request as { user?: OpenIdProfile };
  return getRequestContext(headers, profile);
}

// eslint-disable-next-line @typescript-eslint/require-await
const requestContext = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const rc = await getRequestContextFastify(request);

    if (rc.isErr()) {
      switch (rc.error.type) {
        case RequestContextErrorType.ApplicationError:
          throw new Error(rc.error.message);
        case RequestContextErrorType.NotAuthenticated:
          logger().debug({ rc: rc.error }, "Not authenticated");
          return reply.status(401).send();
        case RequestContextErrorType.Unauthorized:
          return reply.redirect(rc.error.action.url);
        case RequestContextErrorType.WorkspaceInactive:
          logger().info(
            {
              contextErrorMsg: rc.error.message,
              workspace: rc.error.workspace,
            },
            "workspace inactive",
          );
          return reply.status(403).send();
        default:
          logger().error(
            {
              err: rc.error,
            },
            "unknown request context error",
          );
          return reply.status(403).send();
      }
    }

    const requestWorkspaceIdResult = await getWorkspaceId(request);
    if (requestWorkspaceIdResult.isErr()) {
      return reply.status(400).send();
    }

    const { workspace, member, memberRoles } = rc.value;
    const workspaceId = requestWorkspaceIdResult.value;
    if (workspaceId !== workspace.id) {
      logger().error(
        {
          workspaceId,
          workspaceIdFromRequest: workspace.id,
        },
        "workspace id does not match",
      );
      return reply.status(403).send();
    }

    request.requestContext.set("workspace", workspace);
    request.requestContext.set("member", member);
    request.requestContext.set("memberRoles", memberRoles);
    return null;
  });
});

export default requestContext;

export function getOccupantFromRequest(request: FastifyRequest): {
  workspaceOccupantId: string;
  workspaceOccupantType: DBWorkspaceOccupantType;
} | null {
  const { embeddedSession } = request.raw as {
    embeddedSession?: EmbeddedSession;
  };
  if (backendConfig().authMode === "anonymous") {
    return {
      workspaceOccupantId: "anonymous",
      workspaceOccupantType: "WorkspaceMember",
    };
  }

  if (embeddedSession?.occupantId) {
    return {
      workspaceOccupantId: embeddedSession.occupantId,
      workspaceOccupantType: "ChildWorkspaceOccupant",
    };
  }

  const member = request.requestContext.get("member");
  if (member) {
    return {
      workspaceOccupantId: member.id,
      workspaceOccupantType: "WorkspaceMember",
    };
  }
  return null;
}
