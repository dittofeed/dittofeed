import backendConfig from "backend-lib/src/config";
import {
  getRequestContext,
  RequestContextErrorType,
  SESSION_KEY,
} from "backend-lib/src/requestContext";
import { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

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

// eslint-disable-next-line @typescript-eslint/require-await
const requestContext = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const headers = {
      ...request.headers,
      ...requestToSessionValue(request),
    };
    const rc = await getRequestContext(headers);

    if (rc.isErr()) {
      switch (rc.error.type) {
        case RequestContextErrorType.ApplicationError:
          throw new Error(rc.error.message);
        case RequestContextErrorType.NotAuthenticated:
          return reply.status(401).send();
        default:
          return reply.status(403).send();
      }
    }

    const { workspace, member, memberRoles } = rc.value;
    request.requestContext.set("workspace", workspace);
    request.requestContext.set("member", member);
    request.requestContext.set("memberRoles", memberRoles);
    return null;
  });
});

export default requestContext;
