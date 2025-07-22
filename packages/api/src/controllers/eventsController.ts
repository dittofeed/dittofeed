import { writeToString } from "@fast-csv/format";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  DownloadEventsRequest,
  GetEventsRequest,
  GetEventsResponse,
  GetEventsResponseItem,
  GetPropertiesRequest,
  GetPropertiesResponse,
  GetTraitsRequest,
  GetTraitsResponse,
} from "backend-lib/src/types";
import {
  findIdentifyTraits,
  findManyEventsWithCount,
  findTrackProperties,
} from "backend-lib/src/userEvents";
import { format } from "date-fns";
import { FastifyInstance } from "fastify";

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
      const { events: eventsRaw, count } = await findManyEventsWithCount(
        request.query,
      );

      const events: GetEventsResponseItem[] = eventsRaw.flatMap(
        ({
          message_id,
          processing_time,
          user_id,
          event_type,
          anonymous_id,
          event,
          event_time,
          traits,
          properties,
        }) => {
          let colsolidatedTraits: string;
          if (traits.length) {
            colsolidatedTraits = traits;
          } else if (properties.length) {
            colsolidatedTraits = properties;
          } else {
            colsolidatedTraits = "{}";
          }
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
      return reply.status(200).send({
        events,
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
      // Get all events without pagination for CSV export
      const { events } = await findManyEventsWithCount({
        ...request.query,
        limit: undefined, // Remove pagination to get all events
        offset: undefined,
      });

      // Transform events to CSV format
      const csvData = events.map((event) => ({
        messageId: event.message_id,
        eventType: event.event_type,
        event: event.event,
        userId: event.user_id || "",
        anonymousId: event.anonymous_id || "",
        processingTime: event.processing_time,
        eventTime: event.event_time,
        traits: event.traits,
        properties: event.properties,
      }));

      // Define CSV headers
      const headers = [
        "messageId",
        "eventType",
        "event",
        "userId",
        "anonymousId",
        "processingTime",
        "eventTime",
        "traits",
        "properties",
      ];

      const fileContent = await writeToString(csvData, { headers });
      const formattedDate = format(new Date(), "yyyy-MM-dd");
      const fileName = `events-${formattedDate}.csv`;

      return reply
        .header("Content-Disposition", `attachment; filename=${fileName}`)
        .type("text/csv")
        .send(fileContent);
    },
  );
}
