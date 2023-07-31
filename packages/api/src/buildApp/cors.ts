import fastifyCors from "@fastify/cors";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

// eslint-disable-next-line @typescript-eslint/require-await
// Using fastify-plugin to ensure it is installed globally
const cors = fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyCors, {
    origin: "*",
    methods: "*",
    allowedHeaders: "*",
    exposedHeaders: ["Content-Disposition"],
  });
});
export default cors;
