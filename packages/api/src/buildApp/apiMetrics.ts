import { getMeter, getMeterProvider } from "backend-lib/src/openTelemetry";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

// eslint-disable-next-line @typescript-eslint/require-await
const apiMetrics = fp(async (fastify: FastifyInstance) => {
  const meter = getMeter();
  const statuses = meter.createHistogram("api-statuses", {
    description: "Response status codes",
  });

  fastify.addHook("onSend", (_request, reply, _payload, next) => {
    console.log("api statusCode", reply.statusCode);
    statuses.record(reply.statusCode);
    next();
  });
});

export default apiMetrics;

// dittofeed-otel-collector-1  | 2023-04-17T00:39:42.258Z	info	zapgrpc/zapgrpc.go:178	[transport] transport: closing: EOF	{"grpc_log": true}
// dittofeed-otel-collector-1  | 2023-04-17T00:39:42.258Z	info	zapgrpc/zapgrpc.go:178	[transport] transport: loopyWriter exited. Closing connection. Err: transport closed by client	{"grpc_log": true}
