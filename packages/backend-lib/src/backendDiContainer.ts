import { DiContainer } from "isomorphic-lib/src/diContainer";

import { RequestContextPostProcessor } from "./types";

// declaring as global because singletons are wacky in jest

declare global {
  // eslint-disable-next-line vars-on-top, no-var
  var BACKEND_DI_CONTAINER_INSTANCE: DiContainer | null;
}

// Initialize if not already set
if (typeof globalThis.BACKEND_DI_CONTAINER_INSTANCE === "undefined")
  globalThis.BACKEND_DI_CONTAINER_INSTANCE = null;

export function backendDiContainer(): DiContainer {
  if (!globalThis.BACKEND_DI_CONTAINER_INSTANCE) {
    globalThis.BACKEND_DI_CONTAINER_INSTANCE = new DiContainer();
  }
  return globalThis.BACKEND_DI_CONTAINER_INSTANCE;
}

export const BACKEND_DI_CONTAINER_KEYS = {
  REQUEST_CONTEXT_POST_PROCESSOR:
    DiContainer.createServiceKey<RequestContextPostProcessor>(
      "requestContextPostProcessor",
    ),
} as const;
