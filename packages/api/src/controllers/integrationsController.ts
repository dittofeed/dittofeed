import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { upsertIntegration } from "backend-lib/src/integrations";
import {
  IntegrationResource,
  UpsertIntegrationResource,
} from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import { RoleEnum } from "isomorphic-lib/src/types";

import { denyUnlessAtLeastRole } from "../buildApp/workspaceRoleGuard";

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
      if (denyUnlessAtLeastRole(request, reply, RoleEnum.WorkspaceManager)) {
        return;
      }
      const integration = await upsertIntegration(request.body);
      return reply.status(200).send(integration);
    },
  );
}
