import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { DEFAULT_SUBSCRIPTION_TEMPLATE } from "backend-lib/src/subscriptionManagementTemplate";
import {
  deleteSubscriptionManagementTemplate,
  getSubscriptionManagementTemplate,
  upsertSubscriptionManagementTemplate,
} from "backend-lib/src/subscriptionManagementTemplateCrud";
import { FastifyInstance } from "fastify";

import { getWorkspaceId } from "../workspace";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function subscriptionManagementTemplateController(
  fastify: FastifyInstance,
) {
  // Get template for workspace
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description:
          "Get the custom subscription management template for the workspace. Pass includeDefault=true to also get the default template.",
        querystring: Type.Object({
          includeDefault: Type.Optional(
            Type.String({
              description: "Set to 'true' to include the default template",
            }),
          ),
        }),
        response: {
          200: Type.Object({
            template: Type.Union([Type.String(), Type.Null()]),
            defaultTemplate: Type.Optional(Type.String()),
          }),
          401: Type.Object({
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const workspaceIdResult = await getWorkspaceId(request);
      if (workspaceIdResult.isErr() || !workspaceIdResult.value) {
        return reply.status(401).send({ message: "Unauthorized" });
      }
      const workspaceId = workspaceIdResult.value;

      const template = await getSubscriptionManagementTemplate({ workspaceId });
      const includeDefault = request.query.includeDefault === "true";

      return reply.status(200).send({
        template: template?.template ?? null,
        ...(includeDefault
          ? { defaultTemplate: DEFAULT_SUBSCRIPTION_TEMPLATE }
          : {}),
      });
    },
  );

  // Upsert template
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description:
          "Create or update the subscription management template for the workspace.",
        body: Type.Object({
          template: Type.String({
            description: "The Liquid template content",
          }),
        }),
        response: {
          200: Type.Object({
            id: Type.String(),
            template: Type.String(),
          }),
          400: Type.Object({
            message: Type.String(),
          }),
          401: Type.Object({
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const workspaceIdResult = await getWorkspaceId(request);
      if (workspaceIdResult.isErr() || !workspaceIdResult.value) {
        return reply.status(401).send({ message: "Unauthorized" });
      }
      const workspaceId = workspaceIdResult.value;

      const { template } = request.body;

      const result = await upsertSubscriptionManagementTemplate({
        workspaceId,
        template,
      });

      if (result.isErr()) {
        return reply.status(400).send({
          message: "Failed to save template",
        });
      }

      const savedTemplate = result.value;

      return reply.status(200).send({
        id: savedTemplate.id,
        template: savedTemplate.template,
      });
    },
  );

  // Delete template (reset to default)
  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description:
          "Delete the custom subscription management template, reverting to the default.",
        response: {
          204: Type.Null(),
          401: Type.Object({
            message: Type.String(),
          }),
          404: Type.Object({
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const workspaceIdResult = await getWorkspaceId(request);
      if (workspaceIdResult.isErr() || !workspaceIdResult.value) {
        return reply.status(401).send({ message: "Unauthorized" });
      }
      const workspaceId = workspaceIdResult.value;

      const result = await deleteSubscriptionManagementTemplate({
        workspaceId,
      });

      if (result.isErr()) {
        return reply.status(404).send({
          message: "No custom template found",
        });
      }

      return reply.status(204).send();
    },
  );
}
