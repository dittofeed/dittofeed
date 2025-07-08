import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  findManyIntegrations,
  upsertIntegration,
} from "backend-lib/src/integrations";
import {
  createCustomSegmentObject,
  validateTwentyCrmApiKey,
} from "backend-lib/src/twentyCrm";
import {
  CreateCustomSegmentObjectError,
  CreateCustomSegmentObjectRequest,
  CreateCustomSegmentObjectResponse,
  IntegrationResource,
  ListIntegrationsRequest,
  ListIntegrationsResponse,
  UpsertIntegrationResource,
  ValidateTwentyCrmApiKeyRequest,
  ValidateTwentyCrmApiKeyResponse,
} from "backend-lib/src/types";
import { FastifyInstance } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function integrationsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or update an integration.",
        tags: ["Integrations"],
        body: UpsertIntegrationResource,
        response: {
          200: IntegrationResource,
        },
      },
    },
    async (request, reply) => {
      const integration = await upsertIntegration(request.body);
      return reply.status(200).send(integration);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "List integrations.",
        tags: ["Integrations"],
        querystring: ListIntegrationsRequest,
        response: {
          200: ListIntegrationsResponse,
        },
      },
    },
    async (request, reply) => {
      const integrations = await findManyIntegrations(request.query);
      return reply.status(200).send(integrations);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/twentycrm/validate-api-key",
    {
      schema: {
        description: "Validate a TwentyCRM API key.",
        tags: ["Integrations"],
        body: ValidateTwentyCrmApiKeyRequest,
        response: {
          200: ValidateTwentyCrmApiKeyResponse,
        },
      },
    },
    async (request, reply) => {
      const response = await validateTwentyCrmApiKey(request.body);
      return reply.status(200).send(response);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/twentycrm/create-custom-segment-object",
    {
      schema: {
        description: "Create a custom segment object in TwentyCRM.",
        tags: ["Integrations"],
        body: CreateCustomSegmentObjectRequest,
        response: {
          200: CreateCustomSegmentObjectResponse,
          400: CreateCustomSegmentObjectError,
        },
      },
    },
    async (request, reply) => {
      const response = await createCustomSegmentObject(request.body);
      if (response.isErr()) {
        return reply.status(400).send(response.error);
      }
      return reply.status(200).send(response.value);
    },
  );
}
