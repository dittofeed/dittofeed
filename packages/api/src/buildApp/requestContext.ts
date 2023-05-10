import logger from "backend-lib/src/logger";
import {
  getRequestContext,
  RequestContextErrorType,
} from "backend-lib/src/requestContext";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

// eslint-disable-next-line @typescript-eslint/require-await
const requestContext = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("preHandler", async (request, reply) => {
    async function logRequest(str: string) {
      const file = await request.file();
      logger().debug(
        {
          file,
          body: request.body,
          rawBody: request.rawBody,
        },
        `requestContext preHandler ${str}`
      );
    }

    await logRequest("pre getReqCtx");
    await (async () => {})();
    await logRequest("post empty");
    const rc = await getRequestContext(request.headers.authorization ?? null);
    await logRequest("post getReqCtx");

    if (rc.isErr()) {
      switch (rc.error.type) {
        case RequestContextErrorType.ApplicationError:
          throw new Error(rc.error.message);
        default:
          return reply.status(403).send();
      }
    }

    await logRequest("post rc.isErr");
    const { workspace, member, memberRoles } = rc.value;
    request.requestContext.set("workspace", workspace);
    request.requestContext.set("member", member);
    request.requestContext.set("memberRoles", memberRoles);
    await logRequest("post set rc");
    return null;
  });
});
export default requestContext;
