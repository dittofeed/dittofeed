import {
  BACKEND_DI_CONTAINER_KEYS,
  backendDiContainer,
} from "./backendDiContainer";
import logger from "./logger";
import { RequestContextResult } from "./types";

export function registerBackendDi() {
  // Register default implementations.
  backendDiContainer().register(
    BACKEND_DI_CONTAINER_KEYS.REQUEST_CONTEXT_POST_PROCESSOR,
    // eslint-disable-next-line @typescript-eslint/require-await
    async (result: RequestContextResult) => {
      logger().debug(
        {
          result,
        },
        "loc3",
      );
      return result;
    },
  );
}
