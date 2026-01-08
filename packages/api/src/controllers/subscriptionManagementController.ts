import formbody from "@fastify/formbody";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import logger from "backend-lib/src/logger";
import {
  getUserSubscriptions,
  lookupUserForSubscriptions,
  updateUserSubscriptions,
} from "backend-lib/src/subscriptionGroups";
import { generateSubscriptionManagementPage } from "backend-lib/src/subscriptionManagementPage";
import {
  EmptyResponse,
  SubscriptionChange,
  UserSubscriptionsUpdate,
} from "backend-lib/src/types";
import { and, eq } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { SubscriptionParams } from "isomorphic-lib/src/types";

export default async function subscriptionManagementController(
  fastify: FastifyInstance,
) {
  // Register formbody to accept application/x-www-form-urlencoded POST data
  await fastify.register(formbody);

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
        userUpdates: [
          {
            userId,
            changes,
          },
        ],
      });

      return reply.status(204).send();
    },
  );

  // Serve subscription management page as self-contained HTML
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/page",
    {
      schema: {
        description:
          "Serves a self-contained subscription management page with inlined JavaScript.",
        querystring: SubscriptionParams,
        response: {
          200: Type.String(),
          401: Type.Object({
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const {
        w: workspaceId,
        i: identifier,
        ik: identifierKey,
        h: hash,
        s: subscriptionGroupId,
        sub,
        isPreview: isPreviewParam,
        success: successParam,
        error: errorParam,
        previewSubmitted: previewSubmittedParam,
      } = request.query;

      const isPreview = isPreviewParam === "true";
      const success = successParam === "true";
      const error = errorParam === "true";
      const previewSubmitted = previewSubmittedParam === "true";

      // Look up user and workspace
      const [userLookupResult, workspace] = await Promise.all([
        isPreview
          ? null
          : lookupUserForSubscriptions({
              workspaceId,
              identifier,
              identifierKey,
              hash,
            }),
        db().query.workspace.findFirst({
          where: eq(schema.workspace.id, workspaceId),
        }),
      ]);

      let userId: string | undefined;
      if (userLookupResult) {
        if (userLookupResult.isErr()) {
          logger().info(
            {
              err: userLookupResult.error,
            },
            "Failed user lookup for subscription page",
          );
          return reply.status(401).send({
            message: "Unauthorized",
          });
        }
        userId = userLookupResult.value.userId;
      } else {
        // Preview mode
        userId = "123-preview";
      }

      if (!workspace) {
        logger().error({
          err: new Error("Workspace not found"),
        });
        return reply.status(401).send({
          message: "Unauthorized",
        });
      }

      // Handle subscription change if provided
      let subscriptionChange: "Subscribe" | "Unsubscribe" | undefined;
      let changedSubscriptionChannel: string | undefined;

      if (subscriptionGroupId) {
        const targetSubscriptionGroup =
          await db().query.subscriptionGroup.findFirst({
            where: eq(schema.subscriptionGroup.id, subscriptionGroupId),
          });

        changedSubscriptionChannel = targetSubscriptionGroup?.channel;

        if (sub) {
          // Set subscriptionChange to show the message (works in both preview and real mode)
          subscriptionChange =
            sub === "1"
              ? SubscriptionChange.Subscribe
              : SubscriptionChange.Unsubscribe;

          // Only perform actual subscription update when not in preview mode
          if (!isPreview && targetSubscriptionGroup) {
            if (subscriptionChange === SubscriptionChange.Unsubscribe) {
              // Unsubscribe from all subscription groups in the same channel
              const channelSubscriptionGroups =
                await db().query.subscriptionGroup.findMany({
                  where: and(
                    eq(schema.subscriptionGroup.workspaceId, workspaceId),
                    eq(
                      schema.subscriptionGroup.channel,
                      targetSubscriptionGroup.channel,
                    ),
                  ),
                });

              const channelChanges: Record<string, boolean> = {};
              channelSubscriptionGroups.forEach((sg) => {
                channelChanges[sg.id] = false;
              });

              await updateUserSubscriptions({
                workspaceId,
                userUpdates: [
                  {
                    userId,
                    changes: channelChanges,
                  },
                ],
              });
            } else {
              await updateUserSubscriptions({
                workspaceId,
                userUpdates: [
                  {
                    userId,
                    changes: {
                      [subscriptionGroupId]: true,
                    },
                  },
                ],
              });
            }
          }
        }
      }

      // Get user subscriptions
      const subscriptions = await getUserSubscriptions({
        userId,
        workspaceId,
      });

      // Generate the page HTML
      const html = await generateSubscriptionManagementPage({
        workspaceId,
        workspaceName: workspace.name,
        subscriptions,
        hash,
        identifier,
        identifierKey,
        isPreview,
        subscriptionChange,
        changedSubscriptionId: subscriptionGroupId,
        changedSubscriptionChannel,
        success,
        error,
        previewSubmitted,
      });

      return reply.type("text/html").send(html);
    },
  );

  // Handle form submission for subscription preferences
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/page",
    {
      schema: {
        description:
          "Handles form submission for subscription preferences and redirects back to the page.",
        body: Type.Object({
          w: Type.String({ description: "Workspace ID" }),
          h: Type.String({ description: "Hash for user verification" }),
          i: Type.String({ description: "User identifier" }),
          ik: Type.String({ description: "Identifier key" }),
          isPreview: Type.Optional(Type.String()),
        }),
        response: {
          302: Type.Null(),
          401: Type.Object({
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      // Type from schema defines w, h, i, ik as required strings
      const typedBody = request.body as {
        w: string;
        h: string;
        i: string;
        ik: string;
        isPreview?: string;
        [key: string]: string | undefined;
      };
      const {
        w: workspaceId,
        h: hash,
        i: identifier,
        ik: identifierKey,
        isPreview: isPreviewParam,
      } = typedBody;

      const isPreview = isPreviewParam === "true";

      // Build redirect URL with original params
      const redirectParams = new URLSearchParams({
        w: workspaceId,
        h: hash,
        i: identifier,
        ik: identifierKey,
      });
      if (isPreview) {
        redirectParams.set("isPreview", "true");
      }

      // In preview mode, just redirect with preview_submitted flag
      if (isPreview) {
        redirectParams.set("previewSubmitted", "true");
        return reply.redirect(
          302,
          `/api/public/subscription-management/page?${redirectParams.toString()}`,
        );
      }

      // Verify user
      const userLookupResult = await lookupUserForSubscriptions({
        workspaceId,
        identifier,
        identifierKey,
        hash,
      });

      if (userLookupResult.isErr()) {
        logger().info(
          { err: userLookupResult.error },
          "Failed user lookup for subscription form submission",
        );
        return reply.status(401).send({
          message: "Unauthorized",
        });
      }

      const { userId } = userLookupResult.value;

      // Get all subscription groups for this workspace to determine changes
      const subscriptionGroups = await db().query.subscriptionGroup.findMany({
        where: eq(schema.subscriptionGroup.workspaceId, workspaceId),
      });

      // Build changes object from form data
      // Checkboxes that are checked will have value "true"
      // Checkboxes that are unchecked won't be in the form data at all
      const changes: Record<string, boolean> = {};
      for (const sg of subscriptionGroups) {
        const checkboxName = `sub_${sg.id}`;
        const isChecked = typedBody[checkboxName] === "true";
        changes[sg.id] = isChecked;
      }

      try {
        await updateUserSubscriptions({
          workspaceId,
          userUpdates: [
            {
              userId,
              changes,
            },
          ],
        });
        redirectParams.set("success", "true");
      } catch (error) {
        logger().error({ err: error }, "Failed to update subscriptions");
        redirectParams.set("error", "true");
      }

      return reply.redirect(
        302,
        `/api/public/subscription-management/page?${redirectParams.toString()}`,
      );
    },
  );
}
