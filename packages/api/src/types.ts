import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
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
  ReturnType<typeof logger>,
  TypeBoxTypeProvider
>;

export interface BuildAppOpts {
  extendPlugins?: (fastify: DittofeedFastifyInstance) => Promise<void>;
  registerAuthentication?: (fastify: DittofeedFastifyInstance) => Promise<void>;
}
