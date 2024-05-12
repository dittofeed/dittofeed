import { DittofeedFastifyInstance } from "backend-lib/src/types";

export interface BuildAppOpts {
  extendPlugins?: (fastify: DittofeedFastifyInstance) => Promise<void>;
  registerAuthentication?: (fastify: DittofeedFastifyInstance) => Promise<void>;
}
