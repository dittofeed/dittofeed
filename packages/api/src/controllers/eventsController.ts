import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  GetEventsRequest,
  GetEventsResponse,
  GetEventsResponseItem,
  GetTraitsRequest,
  GetTraitsResponse,
} from "backend-lib/src/types";
import {
  findEventsCount,
  findIdentifyTraits,
  findManyEvents,
} from "backend-lib/src/userEvents";
import { FastifyInstance } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function eventsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get list of events",
        querystring: GetEventsRequest,
        response: {
          200: GetEventsResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, limit, offset, startDate, endDate, userId } =
        request.query;

      const [eventsRaw, count] = await Promise.all([
        findManyEvents({
          workspaceId,
          limit,
          offset,
          startDate,
          endDate,
          userId,
        }),
        findEventsCount({
          workspaceId,
          userId,
        }),
      ]);

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
        }
      );
      return reply.status(200).send({
        events,
        count,
      });
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/traits",
    {
      schema: {
        description: "Get list of traits available on identify calls",
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
    }
  );
}
