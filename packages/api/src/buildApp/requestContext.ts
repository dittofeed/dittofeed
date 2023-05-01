import { RequestContextData } from "@fastify/request-context";
import { Type } from "@sinclair/typebox";
import config from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import { AuthMode } from "backend-lib/src/types";
import { createDecoder } from "fast-jwt";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";

import { getWorkspaceIdFromReq } from "../workspace";

// async function getRequestContextData({authMode}: {
//   authMode: AuthMode
// }): Promise<Partial<RequestContextData>> {
//   return {}
// }

// eslint-disable-next-line @typescript-eslint/require-await
const requestContext = fp(async (fastify: FastifyInstance) => {
  const { authMode } = config();
  fastify.addHook("preHandler", async (request, reply) => {
    // if (authMode === "multi-tenant") {
    //   const { authorization } = request.headers;
    //   const bearerToken = authorization?.replace("Bearer ", "");
    //   const decoded: unknown | null = bearerToken ? decoder(bearerToken) : null;

    //   if (!decoded) {
    //     return reply.status(403).send();
    //   }
    //   const validatedResult = schemaValidate(decoded, DecodedJwt);

    //   if (validatedResult.isErr()) {
    //     return reply.status(403).send();
    //   }
    //   // const { sub, email, picture } = validatedResult.value;
    // } else {
    // }

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
