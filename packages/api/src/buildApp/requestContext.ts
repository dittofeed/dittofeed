import {
  getRequestContext,
  RequestContextErrorType,
} from "backend-lib/src/requestContext";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

// eslint-disable-next-line @typescript-eslint/require-await
const requestContext = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const rc = await getRequestContext(request.headers.authorization ?? null);

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
