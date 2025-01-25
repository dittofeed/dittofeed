import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  deleteComponentConfiguration,
  getComponentConfigurations,
  upsertComponentConfiguration,
} from "backend-lib/src/componentConfigurations";
import { FastifyInstance } from "fastify";
import {
  ComponentConfigurationResource,
  DeleteComponentConfigurationRequest,
  EmptyResponse,
  GetComponentConfigurationsRequest,
  GetComponentConfigurationsResponse,
  UpsertComponentConfigurationRequest,
  UpsertComponentConfigurationValidationError,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function componentConfigurationsController(
  fastify: FastifyInstance,
) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get all component configurations.",
        tags: ["ComponentConfigurations"],
        querystring: GetComponentConfigurationsRequest,
        response: {
          200: GetComponentConfigurationsResponse,
        },
      },
    },
    async (request, reply) => {
      const componentConfigurations = await getComponentConfigurations({
        workspaceId: request.query.workspaceId,
      });
      return reply.status(200).send({ componentConfigurations });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or update a component configuration.",
        tags: ["ComponentConfigurations"],
        body: UpsertComponentConfigurationRequest,
        response: {
          200: ComponentConfigurationResource,
          400: UpsertComponentConfigurationValidationError,
        },
      },
    },
    async (request, reply) => {
      const result = await upsertComponentConfiguration(request.body);
      if (result.isErr()) {
        return reply.status(400).send(result.error);
      }
      return reply.status(200).send(result.value);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description: "Delete a component configuration.",
        tags: ["ComponentConfigurations"],
        querystring: DeleteComponentConfigurationRequest,
        response: {
          204: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      await deleteComponentConfiguration(request.query);
      return reply.status(204).send();
    },
  );
}
