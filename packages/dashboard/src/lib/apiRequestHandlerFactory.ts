import { Static, TSchema } from "@sinclair/typebox";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import FileSaver from "file-saver";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  EphemeralRequestStatus,
} from "isomorphic-lib/src/types";
import { enqueueSnackbar } from "notistack";

import { noticeAnchorOrigin } from "./notices";

/**
 * handler for api requests, but downloads file instead of setting a response
 * @param param0
 * @returns
 */
export function downloadFileFactory<D>({
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
      const response = await axios(requestConfig);
      const contentDisposition = response.headers["content-disposition"];
      let filename = "output.csv"; // Default filename

      if (contentDisposition) {
        // Extract filename from Content-Disposition header
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(contentDisposition);
        if (matches?.[1]) {
          filename = matches[1].replace(/['"]/g, "");
        }
      }

      const blob = new Blob([response.data], { type: "text/csv" });
      FileSaver.saveAs(blob, filename);
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
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
  onFailure,
}: {
  requestConfig: AxiosRequestConfig<D>;
  request: EphemeralRequestStatus<Error>;
  onSuccessNotice?: string;
  onFailureNoticeHandler?: (e: Error) => string;
  setResponse: (response: Static<S>, requestData?: D) => void;
  responseSchema: S;
  setRequest: (request: EphemeralRequestStatus<Error>) => void;
  onFailure?: (e: Error) => void;
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
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
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
      onFailure?.(error);
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

    setRequest({
      type: CompletionStatus.NotStarted,
    });
    setResponse(parsedResponse.value, requestConfig.data);

    if (onSuccessNotice) {
      enqueueSnackbar(onSuccessNotice, {
        variant: "success",
        autoHideDuration: 3000,
        anchorOrigin: noticeAnchorOrigin,
      });
    }
  };
}
