import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import {
  getSubscriptionGroupSegmentName,
  getSubscriptionGroupUnsubscribedSegmentName,
  processSubscriptionGroupCsv,
  subscriptionGroupToResource,
  updateUserSubscriptions,
  upsertSubscriptionGroup,
} from "backend-lib/src/subscriptionGroups";
import {
  CsvUploadValidationError,
  DeleteSubscriptionGroupRequest,
  EmptyResponse,
  ProcessSubscriptionGroupCsvErrorType,
  SavedSubscriptionGroupResource,
  SubscriptionGroupUpsertValidationError,
  UpsertSubscriptionGroupAssignmentsRequest,
  UpsertSubscriptionGroupResource,
  WorkspaceId,
} from "backend-lib/src/types";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import {
  SUBSRIPTION_GROUP_ID_HEADER,
  WORKSPACE_ID_HEADER,
} from "isomorphic-lib/src/constants";

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

      const result = await processSubscriptionGroupCsv({
        csvStream: requestFile.file,
        workspaceId: request.headers[WORKSPACE_ID_HEADER],
        subscriptionGroupId: request.headers[SUBSRIPTION_GROUP_ID_HEADER],
      });

      if (result.isErr()) {
        const { error } = result;
        let errorResponse: CsvUploadValidationError;

        switch (error.type) {
          case ProcessSubscriptionGroupCsvErrorType.MissingHeaders:
          case ProcessSubscriptionGroupCsvErrorType.ParseError:
          case ProcessSubscriptionGroupCsvErrorType.InvalidActionValue:
            errorResponse = { message: error.message };
            break;
          case ProcessSubscriptionGroupCsvErrorType.RowValidationErrors:
            errorResponse = {
              message: error.message,
              rowErrors: error.rowErrors,
            };
            break;
        }
        return reply.status(400).send(errorResponse);
      }

      return reply.status(200).send();
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
      const { workspaceId } = request.query;

      const subscriptionGroups = await db()
        .select()
        .from(schema.subscriptionGroup)
        .where(eq(schema.subscriptionGroup.workspaceId, workspaceId));

      // Fetch segments associated with subscription groups
      const subscriptionGroupIds = subscriptionGroups.map((sg) => sg.id);
      const relatedSegments =
        subscriptionGroupIds.length > 0
          ? await db().query.segment.findMany({
              columns: {
                id: true,
                name: true,
                subscriptionGroupId: true,
              },
              where: and(
                eq(schema.segment.workspaceId, workspaceId),
                isNotNull(schema.segment.subscriptionGroupId),
                inArray(
                  schema.segment.subscriptionGroupId,
                  subscriptionGroupIds,
                ),
              ),
            })
          : [];

      // Build a map of subscriptionGroupId -> { segmentId, unsubscribedSegmentId }
      const segmentMap = new Map<
        string,
        { segmentId?: string; unsubscribedSegmentId?: string }
      >();
      for (const segment of relatedSegments) {
        if (!segment.subscriptionGroupId) continue;

        const expectedSegmentName = getSubscriptionGroupSegmentName(
          segment.subscriptionGroupId,
        );
        const expectedUnsubscribedName =
          getSubscriptionGroupUnsubscribedSegmentName(
            segment.subscriptionGroupId,
          );

        const existing = segmentMap.get(segment.subscriptionGroupId) ?? {};
        if (segment.name === expectedSegmentName) {
          existing.segmentId = segment.id;
        } else if (segment.name === expectedUnsubscribedName) {
          existing.unsubscribedSegmentId = segment.id;
        }
        segmentMap.set(segment.subscriptionGroupId, existing);
      }

      const resources = subscriptionGroups.map((sg) => {
        const resource = subscriptionGroupToResource(sg);
        const segments = segmentMap.get(sg.id);
        return {
          ...resource,
          segmentId: segments?.segmentId,
          unsubscribedSegmentId: segments?.unsubscribedSegmentId,
        };
      });

      return reply.status(200).send(resources);
    },
  );
}
