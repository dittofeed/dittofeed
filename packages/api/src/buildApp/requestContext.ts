import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

import { getWorkspaceIdFromReq } from "../workspace";

// eslint-disable-next-line @typescript-eslint/require-await
const requestContext = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("preHandler", async (request, reply) => {
    logger().debug("setting request context");
    const workspaceId = getWorkspaceIdFromReq(request);

    const workspace = await prisma().workspace.findUnique({
      where: {
        id: workspaceId,
      },
    });

    if (!workspace) {
      return reply.status(404).send({
        message: "workspace not found",
      });
    }
    request.requestContext.set("workspace", workspace);

    return null;
  });
});
export default requestContext;
