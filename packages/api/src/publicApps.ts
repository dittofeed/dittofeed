import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import backendConfig from "backend-lib/src/config";
import { generateDigest } from "backend-lib/src/crypto";
import prisma from "backend-lib/src/prisma";
import { insertUserEvents } from "backend-lib/src/userEvents";
import { FastifyInstance } from "fastify";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import { IdentifyData, WorkspaceId } from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function publicAppsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/identify",
    {
      schema: {
        body: IdentifyData,
      },
    },
    async (request, reply) => {}
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/track",
    {
      schema: {},
    },
    async (request, reply) => {}
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/page",
    {
      schema: {},
    },
    async (request, reply) => {}
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/group",
    {
      schema: {},
    },
    async (request, reply) => {}
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/alias",
    {
      schema: {},
    },
    async (request, reply) => {}
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/batch",
    {
      schema: {},
    },
    async (request, reply) => {}
  );
}
