import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  getChartData,
  GetChartDataRequest,
  GetChartDataResponse,
  getSummarizedData,
  GetSummarizedDataRequest,
  GetSummarizedDataResponse,
} from "backend-lib/src/analysis";
import { FastifyInstance } from "fastify";

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
}
