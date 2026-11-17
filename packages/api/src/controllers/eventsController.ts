import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  getPiiPolicy,
  maskUserEvent,
  recordPiiAccess,
} from "backend-lib/src/pii";
import {
  DownloadEventsRequest,
  GetEventsRequest,
  GetEventsResponse,
  GetEventsResponseItem,
  GetPropertiesRequest,
  GetPropertiesResponse,
  GetTraitsRequest,
  GetTraitsResponse,
  PiiFieldScopeEnum,
} from "backend-lib/src/types";
import {
  buildEventsFile,
  findIdentifyTraits,
  findManyEventsWithCount,
  findTrackProperties,
} from "backend-lib/src/userEvents";
import { FastifyInstance } from "fastify";

import { canUnmaskPii, getRequestMemberId } from "../buildApp/authorization";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function eventsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get list of events",
        tags: ["Events"],
        querystring: GetEventsRequest,
        response: {
          200: GetEventsResponse,
        },
      },
    },
    async (request, reply) => {
      // Create an AbortController that will be aborted when the request is closed
      const abortController = new AbortController();

      // Abort the controller when the request connection is closed
      request.raw.on("close", () => {
        abortController.abort();
      });

      const { events: eventsRaw, count } = await findManyEventsWithCount({
        ...request.query,
        abortSignal: abortController.signal,
      });

      const events: GetEventsResponseItem[] = eventsRaw.flatMap(
        ({
          message_id,
          processing_time,
          user_id,
          event_type,
          anonymous_id,
          event,
          event_time,
          properties,
        }) => {
          const colsolidatedTraits = properties.length ? properties : "{}";
          return {
            messageId: message_id,
            processingTime: processing_time,
            userId: user_id,
            eventType: event_type,
            anonymousId: anonymous_id,
            event,
            eventTime: event_time,
            traits: colsolidatedTraits,
          };
        },
      );

      const policy = await getPiiPolicy(request.query.workspaceId);
      const unmaskPii = canUnmaskPii(request);
      const maskedFieldNames = new Set<string>();
      const presentedEvents = events.map((event) => {
        const masked = maskUserEvent({ event, policy, apply: !unmaskPii });
        for (const fieldName of masked.maskedFieldNames) {
          maskedFieldNames.add(fieldName);
        }
        return masked.event;
      });
      await recordPiiAccess({
        viewer: {
          workspaceId: request.query.workspaceId,
          workspaceMemberId: getRequestMemberId(request),
          unmaskPii,
        },
        action: "ViewEvents",
        scope: PiiFieldScopeEnum.EventProperty,
        fields: maskedFieldNames,
        resourceIds: presentedEvents.map((event) => event.messageId),
      });

      return reply.status(200).send({
        events: presentedEvents,
        count,
      });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/traits",
    {
      schema: {
        description: "Get list of traits available on identify calls",
        tags: ["Events"],
        querystring: GetTraitsRequest,
        response: {
          200: GetTraitsResponse,
        },
      },
    },
    async (request, reply) => {
      const traits = await findIdentifyTraits({
        workspaceId: request.query.workspaceId,
      });
      return reply.status(200).send({ traits });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/properties",
    {
      schema: {
        description: "Get list of properties available on performed calls",
        tags: ["Events"],
        querystring: GetPropertiesRequest,
        response: {
          200: GetPropertiesResponse,
        },
      },
    },
    async (request, reply) => {
      const properties = await findTrackProperties({
        workspaceId: request.query.workspaceId,
      });
      return reply.status(200).send({ properties });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/download",
    {
      schema: {
        description: "Download a csv containing events.",
        tags: ["Events"],
        querystring: DownloadEventsRequest,
        200: {
          type: "string",
          format: "binary",
        },
      },
    },
    async (request, reply) => {
      const policy = await getPiiPolicy(request.query.workspaceId);
      const unmaskPii = canUnmaskPii(request);
      const { fileName, fileContent } = await buildEventsFile(request.query, {
        policy,
        apply: !unmaskPii,
      });
      await recordPiiAccess({
        viewer: {
          workspaceId: request.query.workspaceId,
          workspaceMemberId: getRequestMemberId(request),
          unmaskPii,
        },
        action: "DownloadEvents",
        scope: PiiFieldScopeEnum.EventProperty,
        fields: policy.byScope[PiiFieldScopeEnum.EventProperty],
        resourceIds: [],
      });

      return reply
        .header("Content-Disposition", `attachment; filename=${fileName}`)
        .type("text/csv")
        .send(fileContent);
    },
  );
}
