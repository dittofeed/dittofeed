import logger from "backend-lib/src/logger";
import {
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";

export type DittofeedFastifyInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  ReturnType<typeof logger>
>;

export interface BuildAppOpts {
  extendPlugins?: (fastify: DittofeedFastifyInstance) => Promise<void>;
  registerAuthentication?: (fastify: DittofeedFastifyInstance) => Promise<void>;
}
