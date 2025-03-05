import { DiContainer } from "isomorphic-lib/src/diContainer";

import { RequestContextPostProcessor } from "./types";

declare global {
  // eslint-disable-next-line vars-on-top, no-var
  var BACKEND_DI_CONTAINER_INSTANCE: DiContainer | null;
}

// Initialize if not already set
if (typeof globalThis.BACKEND_DI_CONTAINER_INSTANCE === "undefined")
  globalThis.BACKEND_DI_CONTAINER_INSTANCE = null;

export function backendDiContainer(): DiContainer {
  if (!globalThis.BACKEND_DI_CONTAINER_INSTANCE) {
    const container = new DiContainer();
    globalThis.BACKEND_DI_CONTAINER_INSTANCE = container;
    return container;
  }
  return globalThis.BACKEND_DI_CONTAINER_INSTANCE;
}

export const BACKEND_DI_CONTAINER_KEYS = {
  REQUEST_CONTEXT_POST_PROCESSOR:
    DiContainer.createServiceKey<RequestContextPostProcessor>(
      "requestContextPostProcessor",
    ),
} as const;
