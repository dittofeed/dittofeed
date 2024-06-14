import fastifyMultipart from "@fastify/multipart";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

const multipart = fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyMultipart);
});
export default multipart;
