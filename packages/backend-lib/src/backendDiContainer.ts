import { DiContainer } from "isomorphic-lib/src/diContainer";
import { ok } from "neverthrow";

import { DFRequestContext, RequestContextPostProcessor } from "./types";

export const BACKEND_DI_CONTAINER = new DiContainer();

export const BACKEND_DI_CONTAINER_KEYS = {
  REQUEST_CONTEXT_POST_PROCESSOR:
    DiContainer.createServiceKey<RequestContextPostProcessor>(
      "requestContextPostProcessor",
    ),
} as const;

// Register default implementations.

BACKEND_DI_CONTAINER.register(
  BACKEND_DI_CONTAINER_KEYS.REQUEST_CONTEXT_POST_PROCESSOR,
  // eslint-disable-next-line @typescript-eslint/require-await
  async (_requestContext: DFRequestContext) => {
    return ok(undefined);
  },
);
