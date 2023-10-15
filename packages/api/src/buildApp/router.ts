import backendConfig from "backend-lib/src/config";
import { FastifyInstance } from "fastify";

import broadcastsController from "../controllers/broadcastsController";
import contentController from "../controllers/contentController";
import debugController from "../controllers/debugController";
import eventsController from "../controllers/eventsController";
import indexController from "../controllers/indexController";
import integrationsController from "../controllers/integrationsController";
import journeysController from "../controllers/journeysController";
import publicAppsController from "../controllers/publicAppsController";
import secretsController from "../controllers/secretsController";
import segmentsController from "../controllers/segmentsController";
import settingsController from "../controllers/settingsController";
import authController from "../controllers/singleTenantController";
import subscriptionGroupsController from "../controllers/subscriptionGroupsController";
import subscriptionManagementController from "../controllers/subscriptionManagementController";
import userPropertiesController from "../controllers/userPropertiesController";
import usersController from "../controllers/usersController";
import webhooksController from "../controllers/webhooksController";
import requestContext from "./requestContext";

export default async function router(fastify: FastifyInstance) {
  await fastify.register(indexController, { prefix: "/api" });

  // endpoints with standard authorization
  await fastify.register(
    async (f: FastifyInstance) => {
      await fastify.register(requestContext);

      await Promise.all([
        f.register(contentController, { prefix: "/content" }),
        f.register(eventsController, { prefix: "/events" }),
        f.register(journeysController, { prefix: "/journeys" }),
        f.register(secretsController, { prefix: "/secrets" }),
        f.register(segmentsController, { prefix: "/segments" }),
        f.register(settingsController, { prefix: "/settings" }),
        f.register(integrationsController, { prefix: "/integrations" }),
        f.register(subscriptionGroupsController, {
          prefix: "/subscription-groups",
        }),
        f.register(userPropertiesController, { prefix: "/user-properties" }),
        f.register(broadcastsController, {
          prefix: "/broadcasts",
        }),
        f.register(usersController, { prefix: "/users" }),
        // mount redundant webhooks controller at root level for backwards
        // compatibility. this is the one exception to this route namespace being auth'd.
        f.register(webhooksController, { prefix: "/webhooks" }),
      ]);
    },
    {
      prefix: "/api",
    }
  );

  // endpoints without standard authorization
  await fastify.register(
    async (f: FastifyInstance) => {
      await Promise.all([
        f.register(subscriptionManagementController, {
          prefix: "/subscription-management",
        }),
        f.register(publicAppsController, { prefix: "/apps" }),
        f.register(webhooksController, { prefix: "/webhooks" }),
        backendConfig().authMode === "single-tenant"
          ? f.register(authController, { prefix: "/single-tenant" })
          : null,
      ]);
    },
    { prefix: "/api/public" }
  );

  await fastify.register(
    async (f: FastifyInstance) =>
      Promise.all([f.register(debugController, { prefix: "/debug" })]),
    { prefix: "/internal-api" }
  );
}
