import { getMeter } from "backend-lib/src/openTelemetry";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

// eslint-disable-next-line @typescript-eslint/require-await
const apiMetrics = fp(async (fastify: FastifyInstance) => {
  const meter = getMeter();
  const statuses = meter.createHistogram("api_statuses", {
    description: "Response status codes",
  });

  fastify.addHook("onSend", (_request, reply, _payload, next) => {
    statuses.record(reply.statusCode);
    next();
  });
});

export default apiMetrics;
