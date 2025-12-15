import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import {
  buildSubscriptionChangeEvent,
  parseSubscriptionGroupCsv,
  subscriptionGroupToResource,
  updateUserSubscriptions,
  upsertSubscriptionGroup,
} from "backend-lib/src/subscriptionGroups";
import {
  CsvUploadValidationError,
  DeleteSubscriptionGroupRequest,
  EmptyResponse,
  SavedSubscriptionGroupResource,
  SubscriptionChange,
  SubscriptionGroupUpsertValidationError,
  UpsertSubscriptionGroupAssignmentsRequest,
  UpsertSubscriptionGroupResource,
  WorkspaceId,
} from "backend-lib/src/types";
import {
  findUserIdsByUserProperty,
  InsertUserEvent,
  insertUserEvents,
} from "backend-lib/src/userEvents";
import { eq } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import {
  SUBSRIPTION_GROUP_ID_HEADER,
  WORKSPACE_ID_HEADER,
} from "isomorphic-lib/src/constants";
import { omit } from "remeda";
import { v4 as uuid } from "uuid";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function subscriptionGroupsController(
  fastify: FastifyInstance,
) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or update a subscription group.",
        tags: ["Subscription Groups"],
        body: UpsertSubscriptionGroupResource,
        response: {
          200: SavedSubscriptionGroupResource,
          400: SubscriptionGroupUpsertValidationError,
        },
      },
    },
    async (request, reply) => {
      const result = await upsertSubscriptionGroup(request.body);
      if (result.isErr()) {
        return reply.status(400).send(result.error);
      }
      const resource = subscriptionGroupToResource(result.value);
      return reply.status(200).send(resource);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/assignments",
    {
      schema: {
        description:
          "Create or update user subscription group assignments. This performs a patch update on the user's subscription group assignments.",
        tags: ["Subscription Groups"],
        body: UpsertSubscriptionGroupAssignmentsRequest,
        response: {
          200: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      await updateUserSubscriptions(request.body);
      return reply.status(200).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/upload-csv",
    {
      schema: {
        // TODO upload files to S3 and use a presigned URL
        tags: ["Subscription Groups"],
        headers: Type.Object({
          [WORKSPACE_ID_HEADER]: WorkspaceId,
          [SUBSRIPTION_GROUP_ID_HEADER]: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const requestFile = await request.file();
      if (!requestFile) {
        return reply.status(400).send({
          message: "missing file",
        });
      }
      const csvStream = requestFile.file;
      const workspaceId = request.headers[WORKSPACE_ID_HEADER];
      const subscriptionGroupId = request.headers[SUBSRIPTION_GROUP_ID_HEADER];

      const rows = await parseSubscriptionGroupCsv(csvStream);
      if (rows.isErr()) {
        if (rows.error instanceof Error) {
          const errorResponse: CsvUploadValidationError = {
            message: `misformatted file: ${rows.error.message}`,
          };
          return reply.status(400).send(errorResponse);
        }

        if (rows.error instanceof Array) {
          const errorResponse: CsvUploadValidationError = {
            message: "csv rows contained errors",
            rowErrors: rows.error,
          };
          return reply.status(400).send(errorResponse);
        }

        const errorResponse: CsvUploadValidationError = {
          message: rows.error,
        };
        return reply.status(400).send(errorResponse);
      }

      const emailsWithoutIds: Set<string> = new Set<string>();

      for (const row of rows.value) {
        if (row.email && !row.id) {
          emailsWithoutIds.add(row.email);
        }
      }

      const missingUserIdsByEmail = await findUserIdsByUserProperty({
        userPropertyName: "email",
        workspaceId,
        valueSet: emailsWithoutIds,
      });

      const userEvents: InsertUserEvent[] = [];
      const currentTime = new Date();
      const timestamp = currentTime.toISOString();

      for (const row of rows.value) {
        const userIds = missingUserIdsByEmail[row.email];
        const userId =
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          (row.id as string | undefined) ??
          (userIds?.length ? userIds[0] : uuid());

        if (!userId) {
          continue;
        }

        // Handle action column
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const actionValue = (row as Record<string, string>).action;
        let subscriptionAction = SubscriptionChange.Subscribe; // default to subscribe

        if (actionValue !== undefined && actionValue !== "") {
          if (actionValue === "subscribe") {
            subscriptionAction = SubscriptionChange.Subscribe;
          } else if (actionValue === "unsubscribe") {
            subscriptionAction = SubscriptionChange.Unsubscribe;
          } else {
            // Invalid action value
            const errorResponse: CsvUploadValidationError = {
              message: `Invalid action value: "${actionValue}". Must be "subscribe" or "unsubscribe".`,
            };
            return reply.status(400).send(errorResponse);
          }
        }

        const identifyEvent: InsertUserEvent = {
          messageId: uuid(),
          messageRaw: JSON.stringify({
            userId,
            timestamp,
            type: "identify",
            traits: omit(row, ["id", "action"]),
          }),
        };

        const trackEvent = buildSubscriptionChangeEvent({
          userId,
          currentTime,
          subscriptionGroupId,
          action: subscriptionAction,
        });

        userEvents.push(trackEvent);
        userEvents.push(identifyEvent);
      }
      await insertUserEvents({
        workspaceId,
        userEvents,
      });

      const response = await reply.status(200).send();
      return response;
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description:
          "Delete a subscription group and its corresponding segment.",
        tags: ["Subscription Groups"],
        body: DeleteSubscriptionGroupRequest,
        response: {
          204: EmptyResponse,
          400: Type.Object({
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const result = await db()
        .delete(schema.subscriptionGroup)
        .where(eq(schema.subscriptionGroup.id, request.body.id))
        .returning();
      if (!result.length) {
        return reply.status(404).send();
      }
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get a subscription groups",
        tags: ["Subscription Groups"],
        querystring: Type.Object({
          workspaceId: WorkspaceId,
        }),
        response: {
          200: Type.Array(SavedSubscriptionGroupResource),
        },
      },
    },
    async (request, reply) => {
      const subscriptionGroups = await db()
        .select()
        .from(schema.subscriptionGroup)
        .where(
          eq(schema.subscriptionGroup.workspaceId, request.query.workspaceId),
        );

      const resources = subscriptionGroups.map(subscriptionGroupToResource);
      return reply.status(200).send(resources);
    },
  );
}
