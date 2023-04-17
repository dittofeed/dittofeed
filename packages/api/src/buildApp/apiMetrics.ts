import { getMeter } from "backend-lib/src/openTelemetry";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

// eslint-disable-next-line @typescript-eslint/require-await
const apiMetrics = fp(async (fastify: FastifyInstance) => {
  const meter = getMeter();
  console.log("api metrics");
  const statuses = meter.createHistogram("api-statuses", {
    description: "Response status codes",
  });

  fastify.addHook("onSend", (_request, reply, _payload, next) => {
    console.log("api metrics onSend");
    statuses.record(reply.statusCode);
    next();
  });
});

export default apiMetrics;
