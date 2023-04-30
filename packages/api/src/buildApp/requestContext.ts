import { Type } from "@sinclair/typebox";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import { createDecoder } from "fast-jwt";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

import { getWorkspaceIdFromReq } from "../workspace";

const decoder = createDecoder();

const DecodedJwt = Type.Object({
  sub: Type.String(),
  email: Type.String(),
  picture: Type.Optional(Type.String()),
});

// eslint-disable-next-line @typescript-eslint/require-await
const requestContext = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const { authorization } = request.headers;
    const bearerToken = authorization?.replace("Bearer ", "");
    const decoded: unknown | null = bearerToken ? decoder(bearerToken) : null;
    logger().debug({
      decoded,
    });

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
