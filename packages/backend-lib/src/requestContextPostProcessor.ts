import config from "./config";
import { loadDynamicModule } from "./dynamicLoader";
import { RequestContextPostProcessor, RequestContextResult } from "./types";

export interface RequestContextPostProcessorModule {
  postProcessor: RequestContextPostProcessor;
}

export function requestContextPostProcessor(): Promise<RequestContextPostProcessorModule> {
  return loadDynamicModule<RequestContextPostProcessorModule>({
    path: config().requestContextPostProcessor,
    fallback: {
      // eslint-disable-next-line @typescript-eslint/require-await
      postProcessor: async (result: RequestContextResult) => result,
    },
  });
}
