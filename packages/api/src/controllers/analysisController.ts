import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  getChartData,
  getJourneyEditorStats,
  getSummarizedData,
} from "backend-lib/src/analysis";
import { FastifyInstance } from "fastify";
import {
  GetChartDataRequest,
  GetChartDataResponse,
  GetJourneyEditorStatsRequest,
  GetJourneyEditorStatsResponse,
  GetSummarizedDataRequest,
  GetSummarizedDataResponse,
} from "isomorphic-lib/src/types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function analysisController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/chart-data",
    {
      schema: {
        description: "Get chart data for analysis dashboard.",
        tags: ["Analysis"],
        querystring: GetChartDataRequest,
        response: {
          200: GetChartDataResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await getChartData(request.query);
      return reply.status(200).send(result);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/summary",
    {
      schema: {
        description: "Get summarized metrics for analysis dashboard.",
        tags: ["Analysis"],
        querystring: GetSummarizedDataRequest,
        response: {
          200: GetSummarizedDataResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await getSummarizedData(request.query);
      return reply.status(200).send(result);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/journey-stats",
    {
      schema: {
        description: "Get journey editor statistics for a specific journey.",
        tags: ["Analysis"],
        querystring: GetJourneyEditorStatsRequest,
        response: {
          200: GetJourneyEditorStatsResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await getJourneyEditorStats(request.query);
      return reply.status(200).send(result);
    },
  );
}
