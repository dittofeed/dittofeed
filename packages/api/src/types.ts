import { FastifyInstance } from "fastify";

export interface BuildAppOpts {
  registerAuthentication?: (fastify: FastifyInstance) => Promise<void>;
}
