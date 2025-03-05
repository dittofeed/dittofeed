import { loadDynamicModule } from "./dynamicLoader";
import { RequestContextPostProcessor, RequestContextResult } from "./types";

export interface RequestContextPostProcessorModule {
  postProcessor: RequestContextPostProcessor;
}

export function requestContextPostProcessor(): RequestContextPostProcessorModule {
  const module: RequestContextPostProcessorModule =
    loadDynamicModule<RequestContextPostProcessorModule>({
      moduleName: "requestContextPostProcessor",
      fallback: {
        // eslint-disable-next-line @typescript-eslint/require-await
        postProcessor: async (result: RequestContextResult) => result,
      },
    });
  return module;
}
