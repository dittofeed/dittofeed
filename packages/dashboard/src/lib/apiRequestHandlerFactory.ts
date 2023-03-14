import { Static,TSchema } from "@sinclair/typebox";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  EphemeralRequestStatus,
} from "isomorphic-lib/src/types";

export default function apiRequestHandlerFactory<S extends TSchema, E>({
  request,
  requestConfig,
  setRequest,
  responseSchema,
  setResponse,
}: {
  requestConfig: AxiosRequestConfig;
  request: EphemeralRequestStatus<E>;
  setResponse: (response: Static<S>) => void;
  responseSchema: S;
  setRequest: (request: EphemeralRequestStatus<Error>) => void;
}) {
  return async function apiRequestHandler() {
    if (request.type === CompletionStatus.InProgress) {
      return;
    }

    setRequest({
      type: CompletionStatus.InProgress,
    });
    let response: AxiosResponse;
    try {
      response = await axios(requestConfig);
    } catch (e) {
      const error = e as Error;

      setRequest({
        type: CompletionStatus.Failed,
        error,
      });
      return;
    }
    const parsedResponse = schemaValidate(response.data, responseSchema);
    if (parsedResponse.isErr()) {
      console.error("unable to parse response", parsedResponse.error);

      setRequest({
        type: CompletionStatus.Failed,
        error: new Error(JSON.stringify(parsedResponse.error)),
      });
      return;
    }

    setResponse(parsedResponse.value);
    setRequest({
      type: CompletionStatus.NotStarted,
    });
  };
}
