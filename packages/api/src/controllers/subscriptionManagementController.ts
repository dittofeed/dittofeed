import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  lookupUserForSubscriptions,
  updateUserSubscriptions,
} from "backend-lib/src/subscriptionGroups";
import { EmptyResponse, UserSubscriptionsUpdate } from "backend-lib/src/types";
import { FastifyInstance } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function subscriptionManagementController(
  fastify: FastifyInstance,
) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/user-subscriptions",
    {
      schema: {
        description: "Allows users to manage their subscriptions.",
        body: UserSubscriptionsUpdate,
        response: {
          204: EmptyResponse,
          401: Type.Object({
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, identifier, identifierKey, hash, changes } =
        request.body;

      const userLookupResult = await lookupUserForSubscriptions({
        workspaceId,
        identifier,
        identifierKey,
        hash,
      });

      if (userLookupResult.isErr()) {
        return reply.status(401).send({
          message: "Invalid user hash.",
        });
      }

      const { userId } = userLookupResult.value;

      await updateUserSubscriptions({
        workspaceId,
        userId,
        changes,
      });

      return reply.status(204).send();
    },
  );
}
