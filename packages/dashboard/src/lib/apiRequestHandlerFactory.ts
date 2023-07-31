import { Static, TSchema } from "@sinclair/typebox";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  EphemeralRequestStatus,
} from "isomorphic-lib/src/types";
import { enqueueSnackbar } from "notistack";

import { noticeAnchorOrigin } from "./notices";

/**
 * Useful for constructing handlers where the response does not need to be parsed.
 * @param param0
 * @returns
 */
export function emptyFactory<D>({
  request,
  requestConfig,
  setRequest,
  onFailureNoticeHandler,
  onSuccessNotice,
}: {
  requestConfig: AxiosRequestConfig<D>;
  request: EphemeralRequestStatus<Error>;
  onSuccessNotice?: string;
  onFailureNoticeHandler?: (e: Error) => string;
  setRequest: (request: EphemeralRequestStatus<Error>) => void;
}) {
  return async function apiRequestHandler() {
    if (request.type === CompletionStatus.InProgress) {
      return;
    }

    setRequest({
      type: CompletionStatus.InProgress,
    });
    try {
      await axios(requestConfig);
    } catch (e) {
      const error = e as Error;

      setRequest({
        type: CompletionStatus.Failed,
        error,
      });

      if (onFailureNoticeHandler) {
        enqueueSnackbar(onFailureNoticeHandler(error), {
          variant: "error",
          autoHideDuration: 10000,
          anchorOrigin: noticeAnchorOrigin,
        });
      }
      return;
    }
    setRequest({
      type: CompletionStatus.NotStarted,
    });

    if (onSuccessNotice) {
      enqueueSnackbar(onSuccessNotice, {
        variant: "success",
        autoHideDuration: 3000,
        anchorOrigin: noticeAnchorOrigin,
      });
    }
  };
}

export default function apiRequestHandlerFactory<D, S extends TSchema>({
  request,
  requestConfig,
  setRequest,
  responseSchema,
  setResponse,
  onFailureNoticeHandler,
  onSuccessNotice,
}: {
  requestConfig: AxiosRequestConfig<D>;
  request: EphemeralRequestStatus<Error>;
  onSuccessNotice?: string;
  onFailureNoticeHandler?: (e: Error) => string;
  setResponse: (response: Static<S>, requestData?: D) => void;
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

      if (onFailureNoticeHandler) {
        enqueueSnackbar(onFailureNoticeHandler(error), {
          variant: "error",
          autoHideDuration: 10000,
          anchorOrigin: noticeAnchorOrigin,
        });
      }
      return;
    }
    const parsedResponse = schemaValidate(response.data, responseSchema);
    if (parsedResponse.isErr()) {
      console.error("unable to parse response", parsedResponse.error);
      const error = new Error(JSON.stringify(parsedResponse.error));

      setRequest({
        type: CompletionStatus.Failed,
        error,
      });

      if (onFailureNoticeHandler) {
        enqueueSnackbar(onFailureNoticeHandler(error), {
          variant: "error",
          autoHideDuration: 10000,
          anchorOrigin: noticeAnchorOrigin,
        });
      }
      return;
    }

    setResponse(parsedResponse.value, requestConfig.data);
    setRequest({
      type: CompletionStatus.NotStarted,
    });

    if (onSuccessNotice) {
      enqueueSnackbar(onSuccessNotice, {
        variant: "success",
        autoHideDuration: 3000,
        anchorOrigin: noticeAnchorOrigin,
      });
    }
  };
}
