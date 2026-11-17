import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  createPiiFields,
  deletePiiFieldsByIds,
  getPiiFields,
  listPiiAccessAudit,
  PII_COLUMN_CATALOG,
  updatePiiField,
} from "backend-lib/src/pii";
import { FastifyInstance } from "fastify";
import {
  CreatePiiFieldsRequest,
  DeletePiiFieldRequest,
  EmptyResponse,
  GetPiiAccessAuditRequest,
  GetPiiAccessAuditResponse,
  GetPiiFieldsRequest,
  GetPiiFieldsResponse,
  UpdatePiiFieldRequest,
} from "isomorphic-lib/src/types";

import { isWorkspaceAdmin } from "../buildApp/authorization";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function piiController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/fields",
    {
      schema: {
        description: "List the PII fields registered for a workspace.",
        tags: ["PII"],
        querystring: GetPiiFieldsRequest,
        response: {
          200: GetPiiFieldsResponse,
        },
      },
    },
    async (request, reply) => {
      const fields = await getPiiFields(request.query);
      return reply.status(200).send({ fields });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/catalog",
    {
      schema: {
        description: "List the platform columns that can be classified as PII.",
        tags: ["PII"],
        response: {
          200: {
            type: "object",
            properties: {
              columns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    category: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["name", "category", "description"],
                },
              },
            },
            required: ["columns"],
          },
        },
      },
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async (request, reply) => {
      return reply.status(200).send({ columns: PII_COLUMN_CATALOG });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/fields",
    {
      schema: {
        description: "Register one or more PII fields.",
        tags: ["PII"],
        body: CreatePiiFieldsRequest,
        response: {
          204: EmptyResponse,
          403: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (!isWorkspaceAdmin(request)) {
        return reply.status(403).send();
      }
      await createPiiFields(request.body);
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().patch(
    "/fields",
    {
      schema: {
        description: "Update the PII category of a registered field.",
        tags: ["PII"],
        body: UpdatePiiFieldRequest,
        response: {
          204: EmptyResponse,
          403: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (!isWorkspaceAdmin(request)) {
        return reply.status(403).send();
      }
      const updated = await updatePiiField(request.body);
      if (!updated) {
        return reply.status(404).send();
      }
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/fields",
    {
      schema: {
        description: "Remove a PII field classification.",
        tags: ["PII"],
        body: DeletePiiFieldRequest,
        response: {
          204: EmptyResponse,
          403: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (!isWorkspaceAdmin(request)) {
        return reply.status(403).send();
      }
      const deleted = await deletePiiFieldsByIds({
        workspaceId: request.body.workspaceId,
        ids: [request.body.id],
      });
      if (deleted === 0) {
        return reply.status(404).send();
      }
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/audit",
    {
      schema: {
        description: "List plaintext PII access audit records.",
        tags: ["PII"],
        querystring: GetPiiAccessAuditRequest,
        response: {
          200: GetPiiAccessAuditResponse,
          403: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      if (!isWorkspaceAdmin(request)) {
        return reply.status(403).send();
      }
      const { audits, nextCursor } = await listPiiAccessAudit(request.query);
      return reply.status(200).send({ audits, nextCursor });
    },
  );
}
